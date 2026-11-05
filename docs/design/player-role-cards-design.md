# Player Role Cards — Detailed Design

**Hàng 6 card trong profile cầu thủ (Data → Player Data) tách theo vai: Defender / Midfielder /
Striker, thay vì một bộ dùng chung cho mọi cầu thủ ngoài sân. Ai đá nhiều vị trí thì có chip
filter để chọn vai. Cạnh đó là hai nút đọc số: `Total` và `Per 90 mins`.**

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-08-19, bản 2 — bảng sân thay hai chip vai).
Tài liệu này mô tả code đang chạy.

Test: `node tests/run.js` → **1225/1225 passed**
(1171 test cũ, 1170 trong đó không sửa một ký tự, + 54 test mới ở `tests/player-role-cards.test.js`).

Đã sửa: `client/assets/app.js`, `client/assets/app.css`, `client/app.html`,
`client/login.html` (cache-bust), `tests/asset-versions.json`, `tests/player-data.test.js` (5 dòng).
**Không chạm:** `index.html` (tagger), `shared.js`, `shared.css`, `Stats/*`, `Player-Lists/*`,
`cloud-sync.js`, `client/assets/supa.js`, `client/assets/site.css`, `deploy.yml`,
không migration DB, không thêm file runtime mới.

**Bản 2 — bảng vị trí thay hai chip:**

| | Kết quả trong code |
|---|---|
| Hai chip `MIDFIELDER` / `STRIKER` | **bỏ hẳn** — chúng nói có bộ card nào, không nói gì về cầu thủ |
| Thay bằng | `positionBoard()`: sân của tagger (`pitchSVG`) + lưới của tagger (`FORMATION_GRID`), sáng đúng ô anh đã đá |
| Bấm một ô | chọn bộ card của nghề ô đó thuộc về; **mọi ô cùng vai sáng cùng nhau**, vì bốn tile bên dưới là của *vai* |
| Card mặc định | nghề của **ô đầu tiên** anh ta đá, không phải ô đá nhiều nhất |
| Vẽ trên sân nào | môn của channel (`state.channel.sport`), tỉ lệ khung lấy từ `PITCH_DIMS` |

**Bốn quyết định trước đó, vẫn nguyên:**

| | | Kết quả trong code |
|---|---|---|
| **D5** | thủ môn **có** hai nút Total / Per 90 | `GK_KPIS` đi qua đúng một builder với ba bộ còn lại; `playerCtl()` không hỏi `who.gk` một lần nào |
| **D6** | **không nhớ** chế độ đọc (phương án a) | `var mode = 'total'` — không localStorage, không hash |
| **D7** | bỏ `%` khỏi nhãn, dùng `(total)` / `(per 90)` | mọi tile đếm được đều mang hậu tố; phần trăm xuống dòng chú thích |
| D3, D4 | thẻ phạt xuống meta, badge vai | như đã duyệt |

> **Ba tile không mang hậu tố, và vì sao.** `Save Rate` là một tỉ lệ, `Clean Sheets` đếm theo
> **trận** chứ không theo phút, `Cards` là một cặp thẻ. Chia chúng cho số phút cho ra đại lượng vô
> nghĩa, nên chúng mang cờ `fixed`: giữ nguyên nhãn và giá trị ở cả hai chế độ. Ba tile, và chỉ ba,
> có một test canh đúng con số đó.

---

## 1. Mục tiêu và ranh giới

### 1.1 Cái phải làm được

1. Trong `#/data/player/<key>/<category>`, hàng `.kpis.six` của một cầu thủ **ngoài sân** phải
   nói đúng nghề anh ta làm: một trung vệ không nên bị đo bằng *Goals · Assists · Key Passes*.
2. Ba nhóm vai, đúng theo bảng bạn đưa:

   | Vai | Nhãn UI | Badge | Các vị trí trên formation board |
   |---|---|---|---|
   | `defender`   | Defender   | `DEF` | `RB`, `CB`, `LB`, `RWB`, `LWB` |
   | `midfielder` | Midfielder | `MID` | `CDM`, `CM`, `RM`, `LM`, `CAM` |
   | `striker`    | Striker    | `ST`  | `LW`, `RW`, `CF`, `RF`, `LF` |

   15 vị trí + `GK` = 16, đúng bằng `POS_ORDER` trong `Stats/stats-view.js:778` và đúng bằng
   toàn bộ nhãn mà `FORMATION_GRID` (`shared.js:116-118`) sinh ra. **Phủ kín, không thừa, không thiếu.**
3. Một **bảng sân** phía trên hàng card, sáng đúng những ô cầu thủ đã đứng. Bấm một ô là chọn
   bộ card của nghề mà ô đó thuộc về. Bộ card mặc định khi mở trang là nghề của **ô đầu tiên
   anh ta đá** (mục 3.3).
4. **Hai nút đọc số** dưới bảng sân: `Total` (mặc định) và `Per 90 mins` (cùng những con số
   ấy, chia cho số phút anh ta thực sự đá, nhân 90). Áp lên **bốn tile bên phải của mọi người,
   thủ môn kể cả** (D5); hai tile `Appearances` / `Minutes` bên trái đứng yên, vì chúng chính là
   cái mẫu số mà "per 90" được tính ra từ đó (mục 4.4).

### 1.2 Cái dứt khoát KHÔNG đổi

| Thứ | Vì sao nó phải nguyên vẹn |
|---|---|
| **Thủ môn** | Bạn viết rõ "(trừ thủ môn)" cho phần **vai**: `who.gk` đi trước mọi thứ, 4 tile *Saves · Conceded · Save Rate · Clean Sheets* giữ nguyên từng chữ, không chip vai, badge vẫn là `GK`. Hai nút đọc số thì anh ta **có** — đó là D5 bạn duyệt sau, và nó không đụng vào bốn tile ấy nói gì. |
| Tab **Overview** | Không đọc `playerIndex`, không đọc vị trí. Hàng `.kpis.six` của nó (`app.js:492`) không bị đụng tới. |
| Tab **Team Data** | `catTabs(cat)` gọi không tham số ở `app.js:654` — chữ ký mới có giá trị mặc định nên call site này sinh ra DOM y hệt. |
| **Danh sách cầu thủ** (`renderPlayerList`, `PL_OUT`, `PL_GK`) | Không thêm cột vai. Vai là chuyện của trang profile. |
| **Bảng theo trận** (`playerMatchTable`) và 4 chip category | Cột vẫn là `PLAYER_CATS` / `GK_COLS` của `shared.js`. Filter vai **không** lọc bảng này. |
| **Tagger, Stats, Player-Lists** | Không sửa `shared.js` → `?v=21` không đổi → 3 trang đang tải nó không cần bump, không có nguy cơ nửa nạc nửa mỡ. |
| Mọi report đã submit | Chỉ **đọc thêm** một trường đã có sẵn trong payload. Không ghi, không migrate, không đổi format. |

---

## 2. Vị trí lấy từ đâu (và tại sao không cần thêm dữ liệu mới)

Dữ liệu vị trí **đã nằm sẵn trong mọi report đã submit**. Không phải thêm gì vào payload.

`Submit Analysis` đóng băng `lineups` vào report (`index.html:914`), và mỗi chấm trong đội hình
mang sẵn `pos`:

```
lineups = {
  home: { roster:[{no,name,pid}], xi:[{no, x, y, pos}], subs:[…], dir:'lr'|'rl' },
  away: { … },
  history: [ { t, team, xi:[{no,x,y,pos}], subs:[…] }, … ]   // ảnh chụp cả XI tại thời điểm t
}
```

`pos` được ghi bằng `zoneAt(x,y,dir)` ở **mọi** đường một chấm có thể ra đời hoặc dịch chuyển —
`index.html:1090, 1139, 1148, 1166, 3098, 3122, 3251, 3395`. Ba hệ quả quan trọng:

1. **`pos` đã được chuẩn hoá theo hướng tấn công.** `zoneAt` đã nuốt `dir` rồi, nên
   `RB` là hậu vệ phải bất kể đội đá sang trái hay sang phải. Thiết kế này **không cần đọc `dir`**.
2. **Cầu thủ vào sân cũng có vị trí thật.** `applySubGroup` (`index.html:3120`) đặt người vào thay
   đúng chỗ người ra (hoặc chỗ analyst kéo tới) rồi mới tính `pos`. Người dự bị vào sân không rơi
   vào "không rõ vị trí".
3. **Ô chờ (staging square) trả về `''`.** `zoneAt` cho chuỗi rỗng ở ô cạnh thủ môn. Một chấm
   chưa được kéo ra khỏi ô chờ là **chưa có vị trí**, không phải "vị trí lạ" — và thiết kế này
   phải đọc nó đúng như thế (mục 3.4).

Đây chính xác là nguồn mà `gkShirts()` (`shared.js:461`) đang dùng để biết ai bắt gôn. Thiết kế
này là **anh em ruột của nó**: cùng một tấm bảng, cùng một cách đi qua `xi` + `history`.

> **Vì sao viết hàm mới trong `app.js` chứ không mở rộng `shared.js`.**
> `shared.js` được `index.html`, `Stats/index.html`, `Player-Lists/index.html` và `app.js` cùng nạp.
> Thêm một hàm vào đó là an toàn về mặt ngôn ngữ nhưng phải bump `?v=` ở **4 chỗ** — và đúng cái
> lỗi "sửa file, bump một nơi, quên nơi kia" đã xảy ra hai lần trong repo này (xem đầu
> `tests/asset-versions.test.js`). Hàm mới chỉ cần một object `lineups` thuần, không cần gì khác
> của `shared.js`, nên nó ở lại `app.js` cạnh `gkFigures()` — đúng tiền lệ đã có.

---

## 3. Mô hình dữ liệu

### 3.1 `posFigures(lineups, team)` — hàm mới, đặt ngay dưới `gkFigures` (`app.js:774`)

Trả về, cho một trận, một map **số áo → vị trí**:

```js
/* Số áo -> vị trí, cho một bên của một trận. Cùng tấm bảng gkShirts() đọc để biết
   ai bắt gôn, chỉ là đọc lấy tất cả các ô thay vì riêng ô GK.

     { '4': { start:'CB', all:['CB','CDM'] } }

   `start` là ô anh ta được XẾP vào: ảnh chụp SỚM NHẤT có tên anh ta — tức XI xuất phát
   với người đá chính, và ô người ra để lại với người vào sân thay. Đó là vị trí đội hình
   giao cho anh, và là cái quyết định vai chính của anh.
   `all` là mọi ô anh từng đứng trong trận: một người bắt đầu ở LB rồi dâng lên LM sau
   một quả thay người có mặt ở cả hai vai, và cả hai đều đúng.

   Ô chờ cạnh thủ môn trả về '' (zoneAt làm thế) — nó là chỗ đứng tạm, không phải vị trí.
   Bỏ qua nó ở đây, chứ không biến nó thành một vai. */
function posFigures(lineups, team) {
  var lu = (lineups && lineups[team]) || null, out = {};
  if (!lu) return out;
  var take = function (xi) {
    (xi || []).forEach(function (p) {
      var no = String(p && p.no == null ? '' : p.no).trim();
      var ps = String(p && p.pos == null ? '' : p.pos).trim();
      if (!no || !ps) return;
      var e = out[no] || (out[no] = { start: '', all: [] });
      if (!e.start) e.start = ps;                        // ảnh chụp sớm nhất thắng
      if (e.all.indexOf(ps) < 0) e.all.push(ps);
    });
  };
  take(lu.xi);                                           // XI xuất phát trước
  ((lineups && lineups.history) || []).filter(function (h) { return h && h.team === team; })
    .slice().sort(function (a, b) { return (+a.t || 0) - (+b.t || 0); })
    .forEach(function (h) { take(h.xi); });              // rồi từng giai đoạn, theo thời gian
  return out;
}
```

Ba điểm đã cân nhắc:

- **Sắp xếp `history` theo `t` trước khi đi qua** — `gkShirts` không cần thứ tự vì nó chỉ hỏi
  có/không, còn `start` thì cần. Snapshot được `push` theo thứ tự tạo, mà một pha thay người
  tag ngược thứ tự vẫn phải cho ra đúng người-được-xếp-ở-đâu-trước.
- **`lu.xi` đi trước `history`** kể cả khi một snapshot có `t` nhỏ hơn: XI xuất phát là gốc.
- **Hàm thuần.** Không ghi vào `lineups`, không ghi vào report. Giống hệt `gkFigures`.

### 3.2 `aggregate()` (`app.js:405`) — thêm đúng một trường

```js
      ids: window.squadIds(rep.lineups || {}, m.side),
      gk: gkFigures(rep.rows, rep.lineups || {}, m.side),
+     /* Ô nào trên bảng đội hình — cái duy nhất nói lên NGHỀ anh ta làm trận đó.
+        Đọc ở đây, nơi một trận được rút gọn đúng một lần, cạnh gk vì cùng một nguồn. */
+     pos: posFigures(rep.lineups || {}, m.side)
```

Thêm một khoá vào object trả về. Không test nào `deepEq(Object.keys(a))` trên aggregate
(đã kiểm: `tests/player-data.test.js:440-458` chỉ kiểm từng trường một), nên đây là phép cộng thuần.

### 3.3 `playerIndex()` (`app.js:835`) — vai của một người qua cả chiến dịch

**Trong vòng lặp theo trận**, thêm một dòng vào record của mỗi trận, song song hệt `gk`:

```js
        p.matches.push({
          m: a.m, gf: a.gf, ga: a.ga,
          stat: a.players[no] || window.newStat(),
          mins: (a.mins && a.mins[no]) || null,
          cards: (a.cards && a.cards[no]) || { y: 0, r: 0 },
          gk: (a.gk && a.gk[no]) || null,
+         pos: (a.pos && a.pos[no]) || null
        });
```

`(a.pos && …)` — không phải phòng thủ thừa: fixture trong `tests/player-data.test.js` dựng
aggregate bằng tay và không có `pos`. Viết thế này thì **50 test cũ của file đó chạy nguyên,
không sửa một chữ**.

**Trong vòng `order.forEach`**, sau khối `gkTotal`:

```js
  /* Every square he has stood in, and how many matches in each — that is what
     the board over his tiles lights up, and what its tooltips count.
     `roles` is the same run read one level up, in the fixed order Defender,
     Midfielder, Striker rather than the order they turned up in: it is what
     says whether a role asked for in the URL is one he ever actually played. */
  var posApps = {}, first = '';
  p.matches.forEach(function (r) {
    if (!r.pos) return;
    /* matches are in kickoff order, so the earliest one that placed him at
       all is the first position he played */
    if (!first && r.pos.start) first = r.pos.start;
    var seen = {};
    (r.pos.all || []).forEach(function (ps) {
      if (seen[ps]) return;
      seen[ps] = 1;
      posApps[ps] = (posApps[ps] || 0) + 1;
    });
  });
  p.posApps = posApps;
  p.pos0 = first;
  p.roles = ROLES.filter(function (r) {
    return ROLE_POS[r[0]].some(function (ps) { return posApps[ps]; });
  }).map(function (r) { return r[0]; });
  /* The card a profile opens on is the job of the FIRST square he played in.
     Not the one he played most: a man is introduced by where he began, and a
     reading that shifts as the season adds matches is a reading nobody can
     point at twice. */
  p.role = ROLE_OF[first] || '';
```

`p.posApps` là *ô nào, mấy trận* — bảng sân sáng theo nó và tooltip đếm theo nó.
`p.pos0` là ô đầu tiên anh ta đá; `p.role` là nghề của ô đó, tức bộ card mở sẵn.
`p.roles` là ba vai theo thứ tự cố định, dùng để kiểm một vai lấy từ URL có thật là vai anh
từng đá hay không. `p.role === ''` nghĩa là **không biết vai** — hợp lệ, có đường đi riêng (3.4).

> **Vì sao "ô đầu tiên" chứ không phải "ô đá nhiều nhất".** Bạn chọn thế, và nó có một tính chất
> mà "nhiều nhất" không có: **nó đứng yên**. Một cầu thủ được giới thiệu bằng chỗ anh bắt đầu, và
> một cách đọc tự đổi khi mùa giải cộng thêm trận là cách đọc không ai chỉ vào hai lần được.
> Cái giá: một tiền đạo có trận đầu tiên bị kéo xuống đá hậu vệ sẽ mở ra ở card hậu vệ. Bảng sân
> ngay trên đó cho anh ta đúng một cú bấm để sang nghề khác, nên cái giá dừng ở một cú bấm.

`p.gk` vẫn được tính đúng như cũ và **đi trước** `p.role` ở mọi chỗ hiển thị.

### 3.4 Bốn trường hợp biên, và câu trả lời cho từng cái

| Tình huống | Kết quả |
|---|---|
| **Thủ môn kiêm cầu thủ** (một trận ô GK, một trận CB) | `p.gk = true` (luật cũ: một trận ở ô GK là đủ cho cả chiến dịch). Anh ta giữ **bộ tile thủ môn** và **không** có chip vai. Hai nút đọc số thì có, như mọi người. |
| **Đá nhiều ô** trong cả chiến dịch | mỗi ô một chấm. Nhiều nhất là 15 ô, và chúng nằm trên lưới của chính tấm bảng nên không thể tràn. |
| Report **không có lineups** | Xem 3.4.1 — cổng Submit Analysis đã **từ chối** đúng trường hợp này, nhưng nó vẫn phải có đường đi. |
| Chấm còn nằm ở **ô chờ** | `pos === ''` → `posFigures` bỏ qua → không vai. Xem 3.4.1. Không bịa ra một vai từ chỗ đứng tạm. |

#### 3.4.1 "Mọi cầu thủ trên sân đều phải có position" — kiểm chứng

Bạn viết câu đó ở mục 4.2 khi xoá bộ `general`. **Tôi đã đi kiểm, và bạn gần như đúng —
có một cổng thật sự chặn.** Nhưng "gần như" ở đây là khoảng cách giữa một trang chạy được và
một trang báo lỗi, nên nó phải được ghi ra:

**Bằng chứng ủng hộ bạn.** `shirtCheck()` (`index.html:2964-2972`) là một trong bảy check của
Submit Analysis, và khi `checkShirtNumbers()` trả `null` — tức `!lineups || !lineups.home ||
!lineups.away` (`index.html:2924`) — nó trả về `ok:false` kèm câu *"This match has no line-up
saved, so no shirt number in it can be vouched for."* `checkAnalysis()` đòi
`checks.every(c => c.ok)` (`:3037`), và Publish bị chặn theo verdict đó (`:4245`). Comment ngay
trên nó nói thẳng: đây **là một REFUSAL chứ không phải warning như trước**.

→ **Một report không có đội hình không thể được publish nữa.** Ràng buộc của bạn được cổng này
giữ, không phải chỉ là quy ước.

**Hai kẽ hở còn lại — cả hai đều thật, cả hai đều hiếm.**

1. **Report cũ.** Cổng trên là một REFUSAL "chứ không phải warning như trước" — nghĩa là đã từng
   có thời nó chỉ cảnh báo. Report publish trong thời gian đó vẫn nằm trong channel, và
   `state.reports` đọc tất cả. Không có migration nào đi sửa chúng.
2. **Cả 11 chấm còn ở ô chờ.** `zoneAt` trả `''` cho ô cạnh thủ môn, và `arrangeXI` **cố ý bỏ qua**
   ô đó (`shared.js:171`) — nó là chỗ đứng tạm cho cả đội vừa thêm vào, chưa kéo ra. Một đội hình
   như thế vẫn có `lineups.home` và `lineups.away`, mọi số áo vẫn nằm trong `xi`, nên **bảy check
   đều xanh và Publish chạy** — trong khi mọi `pos` đều là `''`.

**Hệ quả nếu bỏ hẳn lưới an toàn.** `ROLE_KPIS[''] ` là `undefined`, và `undefined.map(…)` ném
`TypeError` ngay trong `renderPlayerProfile`. Nó không ném ra chỗ trống — nó rơi vào `.catch` của
`dataSource()` (`app.js:340`) và **cả trang Player Data đổi thành "The submitted analyses could
not be read"**. Một cầu thủ hỏng làm hỏng cả tab, kể cả với những cầu thủ có vai đầy đủ.

→ Vì thế mục 4.2.3 **giữ lại một lưới an toàn**, nhưng đúng như bạn muốn: nó **không còn là một
vai thứ tư trong `ROLE_KPIS`**. `ROLE_KPIS` chứa đúng ba vai bạn liệt kê, không hơn.

---

## 4. Sáu card của từng vai

### 4.1 Hai tile cố định + bốn tile theo vai

Bố cục 6 ô giữ nguyên (`.kpis.six`, `app.css:306-308` — **không sửa CSS này**). Hai ô đầu là
**Appearances** và **Minutes**: đúng như comment đang có trong code, *"hai tile đầu là cùng một
việc với bất kỳ ai"*. Bốn ô sau đổi theo vai.

### 4.2 Bảng tile — `ROLE_KPIS`, hằng cấp module trong `app.js`

**Bộ chỉ số là của bạn, giữ nguyên không đề xuất thêm** (D2 đã hoãn). Phần dưới đây chỉ sửa
*cơ chế* cho khớp với những nhãn bạn đã viết.

#### 4.2.1 Ba chỗ đã sửa so với bản bạn viết (D7)

| # | Bạn viết | Thành | Vì sao |
|---|---|---|---|
| 1 | `%Tackles Won`, `%Duels Won`, `% Passes Success`, `% shot on target` — nhãn nói phần trăm, hàm trả về số đếm | nhãn bỏ `%`, số to là **số đếm**, phần trăm xuống dòng chú thích | đúng ý D7: mọi tile là một số đếm, nên mọi tile đều đáp lại hai nút. Phần trăm không có dạng "trên 90 phút", nên nó xuống chỗ nó không phải đổi |
| 2 | `% shot on target` tính `pct(goals, totalShots)` — tỉ lệ **chuyển hoá**, không phải tỉ lệ sút trúng | `Shots On Target` = `shotsOn`, chú thích `pct(shotsOn, totalShots)` | đúng nghĩa cái nhãn, và **đúng công thức** cột *Shooting Accuracy* trong `shared.js:279` — tile và bảng ngay dưới nó không thể nói khác nhau. Có test canh riêng |
| 3 | `Shots` chú thích `N on target` — trùng tile bên cạnh | `attempts on goal` | hai tile cạnh nhau không nói cùng một con số |

Cộng: `% Passes Success` → `Pass Success` (đúng chữ bạn dùng trong ví dụ, và ngắn hơn một ô lưới).

**Hậu tố `(total)` / `(per 90)` do builder gắn, không phải do tile khai.** Một tile tự khai chữ
"total" trong nhãn sẽ bị in hai lần — có test cấm điều đó.

#### 4.2.2 Hằng vai — `client/assets/app.js`

```js
/* ---------- roles ----------
   key, what the chip says, what the badge beside his name says. This order is
   the order the chips appear in and the last tie-break for his main role — read
   from the back line forward, the way POS_ORDER walks the board. */
var ROLES = [['defender', 'Defender', 'DEF'],
             ['midfielder', 'Midfielder', 'MID'],
             ['striker', 'Striker', 'ST']];
/* position -> role. The fifteen outfield squares of FORMATION_GRID, none missing. */
var ROLE_POS = {
  defender:   ['RB', 'CB', 'LB', 'RWB', 'LWB'],
  midfielder: ['CDM', 'CM', 'RM', 'LM', 'CAM'],
  striker:    ['LW', 'RW', 'CF', 'RF', 'LF']
};
var ROLE_OF = {}, ROLE_LABEL = {}, ROLE_BADGE = {};
ROLES.forEach(function (r) {
  ROLE_LABEL[r[0]] = r[1]; ROLE_BADGE[r[0]] = r[2];
  ROLE_POS[r[0]].forEach(function (p) { ROLE_OF[p] = r[0]; });
});
/* Two readings of the same figures, and only two. 'total' is the default
   everywhere it is read, and nothing remembers which one you were on: open a
   player and you are looking at his campaign. */
var MODES = [['total', 'Total'], ['p90', 'Per 90 mins']];

/* ---------- the four tiles that say what job he did ----------
   A tile is an object rather than an array: it carries four things now, and
   [a,b,c,d] at that size stops being readable.

     l      the label, WITHOUT the reading — ' (total)' / ' (per 90)' is added
            on by the row builder, so no tile can disagree with the button
     v      the figure, always a COUNT of things he did, so both readings are
            one function apart
     c      the line under it — a string when fixed, a function (p, p90) when
            it has to read the figure beside it
     fixed  set on the two tiles a rate makes no sense of: a percentage is a
            percentage at any length of season, and a clean sheet is counted in
            matches rather than in minutes. They keep their label and their
            value in both readings.

   Everything comes off p.total — the whole campaign through sumStats() — so
   every percentage is ONE ratio of the totals rather than a mean of per-match
   ratios, exactly as the Total row under the table is. */
var duelsW = function (p) { return p.total.groundDuelsWon + p.total.aerialDuelsWon; };
var duelsT = function (p) { return p.total.groundDuels + p.total.aerialDuels; };
/* "62.5% of 40" — and at a rate, "62.5% of 10.0". The share cannot move with
   the reading; the count it is a share of has to. */
function share(n, d) {
  return function (p, p90) { return pct(n(p), d(p)) + ' of ' + (p90 ? per90(p, d(p)) : d(p)); };
}
```

#### 4.2.3 Bốn tile của mỗi vai

```js
var ROLE_KPIS = {
  defender: [
    { l: 'Tackles Won',   v: function (p) { return p.total.tacklesWon; },
      c: share(function (p) { return p.total.tacklesWon; }, function (p) { return p.total.tackles; }) },
    { l: 'Interceptions', v: function (p) { return p.total.interceptions; }, c: 'balls cut out' },
    { l: 'Clearances',    v: function (p) { return p.total.clearances; },    c: 'balls put away' },
    { l: 'Duels Won',     v: duelsW, c: share(duelsW, duelsT) }
  ],
  midfielder: [
    { l: 'Pass Success', v: function (p) { return p.total.passesComp; },
      c: share(function (p) { return p.total.passesComp; }, function (p) { return p.total.passes; }) },
    { l: 'Key Passes',   v: function (p) { return p.total.keyPasses; },  c: 'shots created' },
    { l: 'Assists',      v: function (p) { return p.total.assists; },    c: 'in this channel' },
    { l: 'Recoveries',   v: function (p) { return p.total.recoveries; }, c: 'balls won back' }
  ],
  striker: [
    { l: 'Goals',   v: function (p) { return p.total.goals; },      c: 'in this channel' },
    { l: 'Assists', v: function (p) { return p.total.assists; },    c: 'in this channel' },
    { l: 'Shots',   v: function (p) { return p.total.totalShots; }, c: 'attempts on goal' },
    { l: 'Shots On Target', v: function (p) { return p.total.shotsOn; },
      c: share(function (p) { return p.total.shotsOn; }, function (p) { return p.total.totalShots; }) }
  ]
};
```

#### 4.2.4 Thủ môn, và lưới an toàn

```js
/* A keeper's four, which the three above cannot hold: his goals, assists and
   key passes are three zeroes that will never be anything else, and what does
   say something about him is what happened at the other end.
   Save Rate and Clean Sheets are `fixed` — see the note on the flag above. */
var GK_KPIS = [
  { l: 'Saves',    v: function (p) { return p.total.saves; },         c: 'shots kept out' },
  { l: 'Conceded', v: function (p) { return gkCell(p, 'conceded'); }, c: 'while he was on' },
  { l: 'Save Rate',    fixed: true, v: function (p) { return gkCell(p, 'rate'); },
    c: 'of the shots on target he faced' },
  { l: 'Clean Sheets', fixed: true, v: function (p) { return gkCell(p, 'clean'); },
    c: 'matches without conceding' }
];
/* NOT a fourth role — ROLE_KPIS holds exactly the three. This is the net under
   the two gaps a role can fall through: a report published back when a missing
   line-up was a warning rather than the refusal shirtCheck() now gives, and a
   board whose dots were never dragged out of the staging square. These four are
   the row every outfield player saw before roles existed, so when the net has
   to catch someone, what he sees is the page he had. */
var FALLBACK_KPIS = [
  { l: 'Goals',      v: function (p) { return p.total.goals; },     c: 'in this channel' },
  { l: 'Assists',    v: function (p) { return p.total.assists; },   c: 'in this channel' },
  { l: 'Key Passes', v: function (p) { return p.total.keyPasses; }, c: 'shots created' },
  { l: 'Cards',      fixed: true, v: function (p) { return p.cards.y + 'Y · ' + p.cards.r + 'R'; },
    c: 'yellow and red' }
];
```

`Object.keys(ROLE_KPIS)` cho **đúng ba vai**, không hơn — đúng như bạn sửa. `GK_KPIS` và
`FALLBACK_KPIS` là hai hằng **riêng**, không phải khoá thứ tư và thứ năm của nó.

Mọi trường đọc đều có sẵn trong `newStat()` (`shared.js:237-240`) — có test chạy cả 20 tile trên
một `newStat()` rỗng để chứng minh. **Không phát minh chỉ số mới, không có Rating, không có số nào
mà một trang khác không dựng lại được.**

Giá trị đi qua `kpi()` → `num()`, **không** qua `esc()`. Chấp nhận được vì mọi giá trị ở đây là số
hoặc chuỗi do `pct()` / `per90()` / `gkCell()` sinh — **không có một chữ nào do người dùng nhập đi
vào ô này**, đúng như tile `Cards` và `Save Rate` vẫn thế từ trước.

### 4.3 Cards đi đâu?

Bộ `defender`, `midfielder`, `striker` **không còn tile Cards**. Thẻ phạt không biến mất —
nó xuống dòng meta, **đúng đường mà thủ môn đã đi từ trước**:

```js
    card.appendChild(el('p', 'pl-meta',
      … ngày tháng … +
-     (who.gk ? ' · ' + who.cards.y + 'Y · ' + who.cards.r + 'R' : '')));
+     /* Kỷ lục thẻ chỉ xuống đây khi hàng tile không còn chỗ cho nó. FALLBACK_KPIS
+        vẫn có tile Cards, nên với người không rõ vai thì dòng này im lặng — y như
+        hôm nay. Một con số không bao giờ xuất hiện hai lần trên cùng một màn hình. */
+     (who.gk || role ? ' · ' + who.cards.y + 'Y · ' + who.cards.r + 'R' : '')));
```

**Bạn đã duyệt (D3).** Đây là hệ quả trông thấy được của việc lấy 4 ô cho vai, và nó nằm gọn
trong đúng thứ bạn yêu cầu đổi.

### 4.4 Hai chế độ đọc: `Total` và `Per 90 mins`

#### 4.4.1 Phép tính

```js
/* The same figure at a rate: n over the minutes he actually played, times 90.

   "—" where there are no minutes to divide by. A player no line-up ever named
   has no rate at all, and 0.0 would claim he had one of zero — the same reading
   minsTotal() takes two lines up, off the same two flags. "—" as well for
   anything that is not a finite number, which is what the keeper's Conceded
   already reads when no board could answer (gkCell).

   The ~ travels the same road it travels in minsTotal(): an approximate
   minutes total can only make an approximate rate, and without the mark "5.2"
   looks more exact than it is.

   The divisor is p.min — the total SHOWN on the Minutes tile beside it. Going
   back to raw seconds would be a truer number and a worse one: it would not be
   dividing what the eye can see in the next tile along. Same reasoning
   playerIndex() gives for adding p.min up the way it does. */
function per90(p, n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  if (!p.timed || !p.min) return '—';
  return (p.exact ? '' : '~') + (n / p.min * 90).toFixed(1);
}
```

`p.timed`, `p.exact`, `p.min` đều đã có sẵn từ `playerIndex()` — **không tính thêm gì, không đọc
thêm gì từ report.** `.toFixed(1)` chứ không `Math.round`: `5` và `5.0` phải đọc như nhau trong
một cột số, và `.k-v` đã đặt `font-variant-numeric:tabular-nums` cho đúng việc đó.

Bốn cửa ra `'—'`, tất cả đều có test:

| Tình huống | Ra |
|---|---|
| `!p.timed` — không trận nào có đội hình | `—` (không phải `0.0`, vốn sẽ khẳng định anh ta có nhịp độ bằng không) |
| `p.min === 0` | `—` |
| `n` không phải số hữu hạn — chính là `Conceded` của thủ môn khi không bảng nào trả lời được | `—` |
| `!p.exact` | có ra số, nhưng mang tiền tố `~`, đúng chỗ `minsTotal()` đặt nó |

#### 4.4.2 Tile nào đổi, tile nào không

| Tile | `Total` | `Per 90 mins` |
|---|---|---|
| `Appearances`, `Minutes` | như hôm nay | **đứng yên** — chúng là mẫu số, không phải tử số |
| tile đếm (17 trong 20) | `Clearances (total)` · `21` · *balls put away* | `Clearances (per 90)` · `5.3` · *balls put away* |
| tile có chú thích tỉ lệ | `Tackles Won (total)` · `9` · *64.3% of 14* | `Tackles Won (per 90)` · `2.3` · *64.3% of 3.5* |
| tile `fixed` (3 trong 20) | `Save Rate` · `90.0%` | **không đổi gì cả**, kể cả nhãn |

Tỉ lệ trong dòng chú thích **không đổi theo chế độ** — nó không thể đổi, một tỉ lệ là một tỉ lệ ở
mọi độ dài mùa giải. Cái đổi là **mẫu số** nó là tỉ lệ của: 14 pha tranh chấp cả chiến dịch là 3.5
pha mỗi 90 phút. Một hàm `share(n, d)` dựng cả bốn chú thích ấy, nên không bản nào lệch bản nào.

Ba tile `fixed` — `Save Rate`, `Clean Sheets`, `Cards` — không mang hậu tố nào, vì không có phép
chia nào áp lên chúng có nghĩa: một tỉ lệ, một số trận, và một bộ đôi thẻ. Test
*"a tile that counts things carries the reading in its label; a fixed one does not"* khoá đúng ba
cái tên đó — thêm hay bớt một tile `fixed` là test đỏ.

#### 4.4.3 Ai có hai nút này

**Tất cả mọi người** (D5). `playerCtl()` không hỏi `who.gk` một lần nào — có test canh chính điều
đó. Nút `Per 90 mins` tự **disable** khi `!who.timed || !who.min`, kèm `title` nói vì sao, thay vì
vẽ ra một hàng gạch ngang đúng nhưng vô ích.

#### 4.4.4 Chế độ đọc không được nhớ (D6, phương án a)

`var mode = 'total';` — một biến cục bộ trong `renderPlayerProfile`. Không `localStorage`, không
hash, không DB. Mở một cầu thủ là nhìn cả chiến dịch của anh ta; muốn nhịp độ thì bấm một nút.

Hai hệ quả, cả hai đều là chủ ý:

- Bấm sang **vai khác** là đổi hash → vẽ lại → chế độ về `Total`. Vai sống trong URL, cách đọc thì
  không, nên cái nào sống lâu hơn là hệ quả trực tiếp của chỗ nó ở.
- Không có khoá `localStorage` mới nào trong repo → không có gì để đụng vào `'hna.rail'`, không có
  `try/catch` mới nào phải viết, không có trạng thái nào sống sót qua một lần tải trang.

## 5. Bảng vị trí và hai nút đọc số

### 5.1 Chỗ đứng trên màn hình

```
┌─ .pl-head ───────────────────────────────────────────────┐
│  Elva                        [ST]            PLAYER ▼    │   badge = vai ĐANG đọc
│  4 appearances · 360' · 7 Jun 2024 → 11 Jun 2025 · 0Y·0R │
└──────────────────────────────────────────────────────────┘
┌─ .pl-pos "Position" ─────────────┐
│ ┌──────────────────────────────┐ │
│ │        ● LM    ● LW          │ │   ← ô sáng = vị trí đã đá
│ │  ────────────  ▶  ─────────  │ │      amber = vai đang đọc
│ │                ● RW          │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
                              [TOTAL] [Per 90]   ← .pl-ctl
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ APPS   │MINUTES │GOALS   │ASSISTS │SHOTS   │SHOTS ON│      ← .kpis.six
│  4     │  360'  │(TOTAL) │(TOTAL) │(TOTAL) │TARGET  │
└────────┴────────┴────────┴────────┴────────┴────────┘
  [Shooting] [Distribution] [Defensive] [Other]                ← .dsubs (KHÔNG đổi)
  ─ bảng theo trận ─                                           ← KHÔNG đổi
```

**Vì sao bỏ hai chip.** `[MIDFIELDER] [STRIKER]` nói có những bộ card nào, và không nói gì về
người đàn ông ấy. Ô sân nói cả hai: nó **là** vị trí anh đã đá, và bấm vào nó **là** chọn bộ card.
Bộ lọc và sự thật trở thành một nút.

**Ô nào sáng amber.** Tất cả các ô của **vai đang đọc**, không riêng ô vừa bấm. Bốn tile bên dưới
là của *vai*, và card của một tiền đạo cánh không thuộc về cánh trái hơn cánh phải. Đó cũng là thứ
dạy người dùng bản đồ ô → vai: bấm `LW` thì `RW` sáng theo.

**Hướng đọc cố định trái → phải.** `pos` được lưu chuẩn hoá — `zoneAt()` đã vắt hướng tấn công ra
khỏi nó — nên không có "hướng của cả chiến dịch" nào để tôn trọng. Một hướng cố định là cách đọc
duy nhất không nhảy giữa hai cầu thủ, hay giữa hai lần mở. Mũi tên ▶ ở giữa sân nói ra điều đó.

**Ai không có bảng.** Thủ môn (không có vai để lọc), và người không đội hình nào xếp vào đâu (một
sân trống là một câu hỏi, mà câu trả lời đã nằm ở bộ tile dự phòng anh ta nhận).

### 5.2 `positionBoard()` — builder mới

```js
/* Where he has stood, on the board he was placed on.

   Two chips reading "Midfielder" and "Striker" said which card sets existed and
   nothing about the man. The squares themselves say both: the same six-by-three
   grid the tagger writes `pos` from (FORMATION_GRID), on the same pitch drawing
   (pitchSVG), with a dot on every square he has actually played and nothing at
   all on the rest. Clicking one picks the card set for the job that square
   belongs to, so the filter and the fact are the same control.

   Every square of a role reads selected together, not just the one clicked: the
   four tiles below are the ROLE's, and a winger's card is no more about the left
   wing than about the right. That is also what teaches the mapping — press LW
   and RW lights with it.

   The board always reads left to right. `pos` is stored canonically, zoneAt()
   having already turned the attacking direction out of it, so there is no one
   direction a campaign was played in to honour — and a fixed one is the only
   reading that does not move between two players, or between two visits.

   Nothing here for a keeper: he has no role to filter by, and his four tiles are
   about the goal. Nothing either for a man no board ever placed — an empty pitch
   would be a question, and the answer is in the empty state he already gets. */
function positionBoard(who, cat, role) {
  if (who.gk || !who.roles.length) return null;
  var card = el('div', 'card pl-pos');
  card.appendChild(el('p', 'card-h', 'Position'));

  /* The channel's own game, so a futsal club gets a futsal court — the tagger
     lays this same six-by-three grid over whichever pitch it drew, and this is
     that pitch read back. The shape comes from PITCH_DIMS rather than from the
     stylesheet for the same reason: a court is not a pitch's proportions.

     The id belongs to the tagger's board, where the dots being placed live in
     it. Nothing reads it here, and two of them in one document is a bug waiting
     for whoever writes the third. */
  var sport = (state.channel && state.channel.sport) || 'football';
  var dim = PITCH_DIMS[sport] || PITCH_DIMS.football;
  var pitch = el('div', 'pl-pitch', pitchSVG(sport).replace(' id="pv-dots"', ''));
  pitch.style.aspectRatio = dim.w + ' / ' + dim.h;
  for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 6; col++) {
      var ps = FORMATION_GRID[effRow(row, 'lr')][effCol(col, 'lr')];
      var r = ps && ROLE_OF[ps];
      if (!r || !who.posApps[ps]) continue;      // the GK square, and every square he never took
      var b = el('button', 'pl-pz' + (r === role ? ' on' : ''),
        '<span class="pl-pz-dot"></span><span class="pl-pz-lb">' + esc(ps) + '</span>');
      b.type = 'button';
      b.style.left = (col * 100 / 6) + '%';
      b.style.top = PZ_ROW_TOP[row] + '%';
      b.style.width = (100 / 6) + '%';
      b.style.height = PZ_ROW_H[row] + '%';
      /* which job it feeds, then how often he took it — the mapping first,
         because that is the thing a click is about to act on */
      b.title = ROLE_LABEL[r] + ' · ' + who.posApps[ps] +
                (who.posApps[ps] === 1 ? ' match' : ' matches') + ' at ' + ps;
      b.setAttribute('data-role', r);
      b.setAttribute('aria-pressed', r === role ? 'true' : 'false');
      pitch.appendChild(b);
    }
  }
  /* Which way the board reads, since it is not the way any one match was played */
  var arrow = el('span', 'pl-pz-arrow', '&#9654;');
  arrow.setAttribute('aria-hidden', 'true');
  pitch.appendChild(arrow);

  /* One listener rather than one per square, as the match tables do it */
  var base = '#/data/player/' + encodeURIComponent(who.key) + '/' + cat + '/';
  pitch.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-role]') : null;
    if (b) location.hash = base + b.getAttribute('data-role');
  });
  card.appendChild(pitch);
  return card;
}
```

### 5.3 `playerCtl()` — nay chỉ còn hai nút đọc số

```js
/* The bar over the tiles: which reading the four on the right are in.
   It draws nothing itself. The caller passes `onMode`, so the only place that
   knows how to build a row of tiles stays renderPlayerProfile(). */
function playerCtl(who, onMode) {
  var bar = el('div', 'pl-ctl');
  var right = el('div', 'pl-grp right');
  var canRate = !!(who.timed && who.min);
  MODES.forEach(function (m) {
    var b = el('button', 'chip' + (m[0] === 'total' ? ' on' : ''), esc(m[1]));
    b.type = 'button';
    /* Nothing to divide by: the rate would be a row of dashes, which is honest
       and useless. Say why instead of offering it. */
    if (m[0] === 'p90' && !canRate) {
      b.disabled = true;
      b.title = 'No match in this channel has a line-up, so there are no minutes to divide by.';
    } else {
      b.addEventListener('click', function () { onMode(m[0]); });
    }
    right.appendChild(b);
  });
  bar.appendChild(right);
  return bar;
}
```

### 5.4 Sáu ô ở nguyên trong `renderPlayerProfile`

```js
  var kpis = el('div', 'kpis six');
  /* Six tiles, and they have to be buildable TWICE now — once here, once more
     every time the reading changes. So a closure rather than an expression: it
     reads who / role / mode from just above it and takes no arguments.

     The first two are the same job for anybody, and they hold still under Per
     90 because they ARE the divisor. The other four are the job he actually
     did — a keeper's goals are three zeroes that will never be anything else,
     and a centre back measured in goals reads just as wrong. One table drives
     all three cases, so no row of tiles is written out twice. */
  var row = function () {
    var p90 = mode === 'p90';
    var set = who.gk ? GK_KPIS : (ROLE_KPIS[role] || FALLBACK_KPIS);
    return kpi('Appearances', who.apps, who.apps === 1 ? 'match played' : 'matches played') +
      kpi('Minutes', minsTotal(who), 'on the pitch') +
      set.map(function (t) {
        /* A `fixed` tile is one no length of season changes: it keeps its label
           and its value, and only the tiles that count things follow the button. */
        var rate = p90 && !t.fixed;
        return kpi(t.l + (t.fixed ? '' : rate ? ' (per 90)' : ' (total)'),
                   rate ? per90(who, t.v(who)) : t.v(who),
                   typeof t.c === 'function' ? t.c(who, p90) : t.c);
      }).join('');
  };
  var paint = function () { kpis.innerHTML = row(); };
  paint();

  var ctl = playerCtl(who, cat, role, function (m) {
    mode = m;
    paint();
    /* The two buttons swap which one is lit, in place — the bar is not rebuilt,
       so no listener is dropped and none is added. */
    ctl.querySelectorAll('.pl-grp.right .chip').forEach(function (b, i) {
      b.classList.toggle('on', MODES[i][0] === m);
    });
  });
  if (ctl) body.appendChild(ctl);
  body.appendChild(kpis);
```

**Vì sao là closure chứ không phải một `kpiRow()` cấp module.** Tách ra ngoài thì bốn tile thủ môn
rời khỏi thân `renderPlayerProfile` — và test *"a keeper-s six tiles are about the goal"* so khớp
hình dạng `who.gk ?` **trong thân hàm đó**. Để nguyên tại chỗ vừa giữ được test vừa là code dễ đọc
hơn: sáu ô nằm đúng chỗ người ta đi tìm chúng.

Ba tính chất đáng ghi:

- **Không có request nào phát sinh.** `p.total` đã nằm sẵn trong bộ nhớ; `per90()` là phép chia.
- **Blast radius bằng hai node.** Bấm nút đọc số không đụng hash, không gọi `route()`, không tháo
  view, không mất vị trí cuộn. Nó viết lại `kpis.innerHTML` và bật/tắt class trên hai nút — cả hai
  đều do chính hàm này vừa dựng ra. **Không một dòng nào của tab khác chạy.**
- **Một builder cho cả ba bộ tile.** Thủ môn, vai, và lưới dự phòng đi qua đúng một `set.map()`,
  nên không có hàng tile nào được viết ra hai lần và không bộ nào lỡ nhịp với hai nút.

### 5.5 Vai sống trong URL

Đúng nguyên tắc đã ghi trong `app.js:294` — *"Which section is open lives in the hash — a link
somebody can send"*. Vai là đoạn **thứ tư**:

```
#/data/player                                        → danh sách
#/data/player/<key>/<category>                       → link cũ, vẫn chạy, vai = mặc định
#/data/player/<key>/<category>/<role>                → mới
```

Cộng thêm ở cuối nên **mọi link đã tồn tại vẫn mở đúng trang cũ**. `rest[3]` không hợp lệ hoặc
thiếu → rơi về `who.role`, không redirect, không trang trắng.

**Không có đoạn thứ năm.** Chế độ đọc không vào hash — lý do ở mục 5.2.1. Route dừng ở 4 đoạn,
đúng như trước khi có hai nút.

### 5.6 `catTabs` phải giữ được vai khi bấm chip category

`catTabs(cat, base, tabs)` dựng href bằng `base + t[0]`. Vai đứng **sau** category nên cần một
đuôi. Thêm tham số thứ tư, có mặc định:

```js
- function catTabs(cat, base, tabs) {
+ /* `tail` là những gì đi SAU khoá category. Player Data treo vai ở đó, nên bấm
+    sang Defensive không hất người ta về vai mặc định. Team Data không truyền gì
+    và sinh ra đúng chuỗi href cũ. */
+ function catTabs(cat, base, tabs, tail) {
    …
-     b.addEventListener('click', function () { location.hash = (base || '#/data/team/') + t[0]; });
+     b.addEventListener('click', function () { location.hash = (base || '#/data/team/') + t[0] + (tail || ''); });
```

Đây đúng là hình dạng mà pha 1 đã dùng khi thêm `base` (xem `docs/player-data-design.md`, mục
"hai điểm lệch") — **một builder chip, không phải hai bản gần giống nhau**.

Call site `app.js:654` (Team Data) không đổi một ký tự → href sinh ra giống hệt.

### 5.7 Dropdown đổi cầu thủ: giữ category, **bỏ** vai

Trong `playerHead`, nút chọn người khác đang giữ lại category. Vai thì **không** giữ:
vai là một sự thật về *người này*, người kia có thể chưa từng đá vai đó. Đổi người → rơi về
`p.role` của chính anh ta. Code hiện tại (`app.js:1092-1096`) **không cần sửa gì** — nó vốn chỉ
sinh ra 4 đoạn, và đoạn thứ năm vắng mặt chính là "dùng mặc định".

---

## 6. Thay đổi chính xác, theo từng file

### 6.1 `client/assets/app.js`

| # | Chỗ | Việc |
|---|---|---|
| 1 | `catTabs` | thêm tham số `tail`, nối vào href |
| 2 | `aggregate()` | thêm khoá `pos: posFigures(rep.lineups \|\| {}, m.side)` |
| 3 | sau `gkFigures()` | **hàm mới** `posFigures()` |
| 4 | sau `minsTotal()` | **hàm mới** `per90()` — cạnh hàm đọc cùng ba cờ `timed`/`exact`/`min` |
| 5 | sau `per90()` | **khối hằng mới**: `ROLES`, `ROLE_POS`, bốn bảng tra, `MODES`, `duelsW`/`duelsT`/`share`, `ROLE_KPIS`, `GK_KPIS`, `FALLBACK_KPIS` |
| 6 | `playerIndex()` | thêm `pos:` vào record mỗi trận; tính `p.posApps`, `p.pos0`, `p.roles`, `p.role` |
| 7 | `renderPlayerData` | truyền `rest[3]` xuống |
| 8 | `renderPlayerProfile` | chữ ký `(body, who, people, wanted, wantedRole)`; chốt `role`; `mode`; closure `row()`; chèn `positionBoard()` rồi `playerCtl()`; truyền `tail` cho `catTabs` |
| 9 | `playerHead` | chữ ký `(who, people, cat, role)`; badge vai; điều kiện dòng thẻ |
| 10 | cạnh `renderPlayerProfile` | **builder mới** `positionBoard()` và `playerCtl()` |

Hai chỗ **cố ý giữ nguyên hình dạng cũ**, vì test hiện có so khớp đúng chúng:

```js
// nhánh thủ môn vẫn là một ternary trên `who.gk`, không phải if/else
var set = who.gk ? GK_KPIS : (ROLE_KPIS[role] || FALLBACK_KPIS);
// và badge GK vẫn là một chuỗi nguyên khối, không gộp vào ROLE_BADGE
(who.gk ? '<span class="pl-role">GK</span>'
        : role ? '<span class="pl-role">' + esc(ROLE_BADGE[role]) + '</span>' : '')
```

### 6.2 `client/assets/app.css` — thêm **một** khối, không sửa khối nào

```css
/* ---------- one player: where he has stood ----------
   The tagger's own pitch (pitchSVG) with the tagger's own squares
   (FORMATION_GRID), read back: a dot on every square he has played, nothing on
   the rest. Clicking one picks the card set for the job it belongs to.

   The class names are pl-pz rather than the tagger's pz on purpose. shared.css
   styles .pz for the formation board, gets loaded the first time anyone opens a
   match, and stays in the document afterwards — its .pz carries
   pointer-events:none, which would leave these squares looking clickable and
   doing nothing. Two boards, two vocabularies, no way for either to reach the
   other. */
.pl-pos{max-width:520px; margin-bottom:14px}
/* aspect-ratio is set inline, off PITCH_DIMS — the channel's game decides it, and
   a futsal court is not a football pitch's shape. This is the fallback for a
   channel whose sport nothing could answer for. */
.pl-pitch{position:relative; aspect-ratio:1050/680; margin-top:11px}
/* The tagger's pitch is grass; this one is a diagram on a dark page. Both come
   out of pitchSVG as presentation attributes, which any rule here outranks. */
.pl-pitch > svg{border-radius:2px}
.pl-pitch > svg > rect{fill:var(--carbon-2)}
.pl-pitch > svg > g{stroke:var(--line-soft)}
.pl-pz{
  position:absolute; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:7px; padding:0; border:0; border-radius:2px;
  background:color-mix(in srgb,var(--chalk) 7%, transparent); cursor:pointer;
  transition:background .16s;
}
.pl-pz:hover{background:color-mix(in srgb,var(--chalk) 13%, transparent)}
.pl-pz-dot{width:21px; height:21px; border-radius:50%; background:var(--chalk); flex:none}
.pl-pz-lb{font-family:var(--f-mono); font-size:10px; letter-spacing:.1em; color:var(--chalk)}
/* the square being read takes the amber of the badge beside his name */
.pl-pz.on{background:color-mix(in srgb,var(--amber) 17%, transparent)}
.pl-pz.on .pl-pz-dot{background:var(--amber)}
.pl-pz.on .pl-pz-lb{color:var(--amber)}
.pl-pz-arrow{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  color:var(--ash-dim); font-size:19px; line-height:1; pointer-events:none;
}
@media (max-width:560px){
  .pl-pz-dot{width:15px; height:15px}
  .pl-pz-lb{font-size:8.5px; letter-spacing:.06em}
}

/* ---------- one player: the bar over his tiles ----------
   Which reading the four tiles on the right are in. */
.pl-ctl{display:flex; align-items:center; flex-wrap:wrap; gap:10px 14px; margin:0 0 14px}
.pl-grp{display:flex; align-items:center; flex-wrap:wrap; gap:7px; min-width:0}
.pl-grp.right{margin-left:auto}
/* Per 90 with no minutes to divide by */
.pl-ctl .chip[disabled]{opacity:.4; cursor:not-allowed}
```

Mọi selector đều bắt đầu bằng `.pl-pos`, `.pl-pitch`, `.pl-pz`, `.pl-ctl` hoặc `.pl-grp` — năm tên
**chưa từng xuất hiện** trong `site.css`, `app.css`, `shared.css` hay `Stats/stats-view.css`.
`.chip` mượn nguyên từ `site.css:193` (file không đụng tới).

> **Chỗ suýt hỏng, và cách tránh.** Bảng đội hình của tagger dùng class `.pz`, định nghĩa trong
> `shared.css` — file được nạp lần đầu ai đó mở một match và **ở lại trong document sau đó**. Rule
> `.pz` của nó mang `pointer-events:none`. Nếu bảng này cũng gọi ô của nó là `.pz` thì sau khi user
> xem một match, mọi ô ở đây **trông bấm được và không bấm được** — còn `.pz` của tôi thì đi ngược
> lại phá bảng đội hình trong Stats view. Hai bảng, hai bộ từ vựng, không đường nào với tới nhau.
> Có test canh cả hai chiều.

### 6.3 Cache-busting — đã làm

| File | Trước | Sau | Sửa ở |
|---|---|---|---|
| `client/assets/app.js` | `?v=33` | **`?v=35`** | `client/app.html:81` |
| `client/assets/app.css` | `?v=16` | **`?v=18`** | `client/app.html:9` **và** `client/login.html:8` |

`app.css` được **hai** trang nạp — bump một, quên một là trang login giữ CSS cũ. Xong rồi chạy
`node tests/asset-versions.test.js --update` để dựng lại manifest.

`shared.js` (`?v=21`) **không đổi** → `Stats/index.html:62`, `Player-Lists/index.html:98`,
`app.js` đều đứng yên. Không thêm file mới → `deploy.yml` không phải sửa.

---

## 7. Test

```bash
node tests/run.js
```

→ **1225/1225 passed** = 1171 test cũ + 54 test mới.

### 7.1 `tests/player-role-cards.test.js` — 54 test

Nửa đầu **chạy thật** `posFigures`, `playerIndex`, `per90` và các bảng tile trong vm. Nửa sau đọc
phần render bằng source — **cộng 13 test vẽ thật cả trang** trong một DOM nhỏ, vì regex trên source
không bắt được một tên ngoài phạm vi hay một trường đọc trên `undefined`.

| Nhóm | Canh cái gì |
|---|---|
| Bản đồ ô → vai | 15 ô ngoài GK đều có đúng **một** vai; `GK` không có vai nào; ba nhóm khớp từng chữ với bảng bạn đưa |
| Bảng tile | `ROLE_KPIS` đúng ba khoá; mỗi bộ đúng 4 tile; cả 20 tile chạy được trên `newStat()` rỗng ở **cả hai chế độ**; không tile nào tự khai `%`/`total`/`per 90`; đúng **ba** tile `fixed`; `Shots On Target` bằng đúng cột *Shooting Accuracy* của `shared.js` |
| `posFigures` | XI xuất phát; người vào sân thay lấy ô người ra; đổi ô giữa trận giữ cả hai; **snapshot ngược thứ tự `t` vẫn ra đúng ô xuất phát**; ô chờ bị bỏ qua; không lineups không ném |
| `playerIndex` | `posApps` đếm **một lần mỗi trận** dù ô lặp lại; **card mặc định là nghề của ô đầu tiên**, và ba trận nữa ở vai khác không viết lại nó; một trận không xếp ai thì bỏ qua chứ không coi là không có vị trí; không đội hình → không vai; thủ môn không đổi một số nào |
| `per90` | phép chia; bốn cửa ra `'—'`; tiền tố `~`; tỉ lệ đứng yên còn mẫu số đi theo; hai ô trái không bao giờ bị chia |
| Bảng vị trí (source) | thủ môn và người-không-vai bị loại; **không còn một chữ `chip` nào trong hàm**; một listener trên sân chứ không phải một trên mỗi ô; URL vẫn là vai; vẽ trên môn của channel; `pv-dots` bị gỡ |
| **Va chạm CSS** | `shared.css` **thật sự** có `.pz{…pointer-events:none}`; không selector nào trong `app.css` tên `.pz`; không tên `pl-pz` nào trong `shared.css`; hàm chỉ viết ra từ vựng của chính nó |
| **Vẽ thật** | ba ô sáng đúng LM/LW/RW và **không ô nào khác trong 18 ô**; toạ độ `left`/`top` đúng ô của `FORMATION_GRID` đọc trái→phải; **cả hai ô của vai đang đọc cùng sáng**, ô của vai kia thì không; tooltip nói nghề + số trận; `aria-pressed`; bấm một ô ra đúng URL kèm category; mở trang không có vai trong URL thì ra card của ô đầu tiên; một-ô vẫn có bảng; hồ sơ hậu vệ ra đúng 6 nhãn + 6 giá trị; `Per 90` chia đúng (`21 → 5.3`); thủ môn ra `Save Rate` / `Clean Sheets` không hậu tố; người không vai ra đúng trang cũ; không phút thì nút bị khoá |

### 7.2 `tests/player-data.test.js` — sửa **5 dòng**, 49/50 test không đổi một ký tự

| Dòng | Việc |
|---|---|
| 37, 38 | nới hai regex chữ ký thành `\([^)]*\)` |
| 47-48 | thêm `posFigures`, `per90` vào `LIFT`; thêm `ROLEBLOCK` vào sandbox |
| 530, 534 | hai assertion so khớp `kpi('Saves'` / `kpi('Goals'` trong thân hàm → nay so khớp `GK_KPIS` và `FALLBACK_KPIS`. **Nội dung khẳng định y nguyên** |
| 536 | dòng thẻ phạt: `who.gk ?` → `who.gk \|\| role ?` — đúng thay đổi **D3 bạn đã duyệt** |

Assertion `who.gk ?` và `pl-role">GK` **không phải sửa** — chủ ý thiết kế (mục 6.1).

## 8. Ma trận không-hồi-quy

| Đường đi | Vì sao nó không gãy |
|---|---|
| Tagger (`index.html`) | Không sửa. `shared.js` không sửa → `?v=21` đứng yên. |
| `Stats/` và `Player-Lists/` | Không sửa. Cùng lý do. |
| Data → **Overview** | Không đọc `playerIndex`. `aggregate()` chỉ **thêm** một khoá; `totalOf`, `playerTally`, `discipline` lặp trên `newStat()` hoặc trên khoá tự chọn, không lặp trên khoá của aggregate. 50 test của `data-page.test.js` xanh nguyên. |
| Data → **Team Data** | `catTabs(cat)` gọi một tham số → `tail` là `undefined` → `(tail \|\| '')` là `''` → href cũ từng ký tự. Có test canh chính call site đó. |
| Player Data → **danh sách** | `renderPlayerList`, `playerTable`, `PL_OUT`, `PL_GK` không sửa. `p.roles` chỉ là thuộc tính thừa trên object. |
| Player Data → **thủ môn** | `who.gk` hỏi **trước** ở cả ba chỗ còn phân biệt (bộ tile, bảng vị trí, badge). Bốn tile của anh ta không đổi một chữ; hai tile `fixed` không đổi kể cả khi bấm `Per 90`. |
| Player Data → **bảng theo trận** | `playerMatchTable(who, cat)` không sửa, không nhận `role`, không nhận `mode`. Có test canh rằng ba chữ đó không xuất hiện trong hàm. |
| **Link cũ** `#/data/player/KEY/defensive` | `rest[3] === undefined` → rơi về `who.role`. Không redirect, không trang trắng. Route vẫn dừng ở 4 đoạn. |
| Report **không có lineups** | `pos = null` xuyên suốt → `role = ''` → `FALLBACK_KPIS` = đúng hàng card hôm nay, thẻ phạt vẫn ở tile. Có test **vẽ thật** kiểm 6 nhãn + 6 giá trị của trường hợp này. |
| Đăng nhập / route khác (`#/channels`, `#/match/…`) | Không chạm `route()`. |
| Rò rỉ listener | `playerCtl` gắn listener lên chính các `<button>` nó dựng; `positionBoard` gắn **một** listener lên tấm sân của nó, không phải một trên mỗi ô. Không có listener nào trên `document`, nên không có gì phải gỡ. Nút `disabled` không được gắn listener nào cả. Đều có test. |
| **Bảng đội hình của tagger** | Đây là chỗ dễ hỏng nhất và nó có mục riêng ở 6.2: `shared.css` nạp một lần rồi ở lại, `.pz` của nó có `pointer-events:none`. Bảng này gọi ô của nó là `.pl-pz`, và hai test canh cả hai chiều — không tên nào của bên này xuất hiện ở bên kia. |
| Môn thể thao khác football | Sân vẽ theo `state.channel.sport` và tỉ lệ khung lấy từ `PITCH_DIMS`, y như tagger làm. Channel không nói môn gì thì về football, đúng fallback thẻ channel đang dùng. |
| Vẽ lại (đổi **vai**) | Đổi hash = `route()` chạy. `dataSource()` và `playerJob` đều cache theo channel → **không request mạng nào phát sinh**. |
| Vẽ lại (đổi **cách đọc**) | Không đụng hash, không gọi `route()`. Hai node, cả hai do chính hàm đó vừa dựng. |
| Trạng thái sống sót qua tải trang | **Không có.** D6 phương án (a): không localStorage, không hash, không DB. Không có gì để đụng vào `'hna.rail'`. |
| Thanh điều khiển **trên màn hẹp** | `.pl-ctl` là `flex-wrap:wrap`; hết chỗ thì hai nhóm xếp chồng. `.kpis.six` giữ nguyên breakpoint 6/3/2 — **không sửa một dòng CSS nào đang có**. |
| CSS giẫm chân | Sáu selector mới đều bắt đầu bằng `.pl-ctl` / `.pl-grp` — hai tên chưa từng xuất hiện trong `site.css`, `app.css`, `shared.css`, `Stats/stats-view.css`. `.chip.role.on` thắng `.chip.on` nhờ cụ thể hơn, không `!important`. Có test canh `.chip` không bị định nghĩa lại. |

---

## 9. Quyết định — đã chốt hết

| | Quyết định | Kết quả |
|---|---|---|
| **D1** | không lọc số theo vai; thay bằng hai nút `Total` / `Per 90 mins` | ✅ mục 4.4 |
| **D2** | bộ 4 chỉ số của từng vai | ⏸ bạn hoãn — giữ đúng như bạn viết, chỉ sửa cơ chế (D7) |
| **D3** | thẻ phạt rời hàng tile xuống dòng meta | ✅ mục 4.3 |
| **D4** | badge vai `DEF`/`MID`/`ST` | ✅ mục 6.1 |
| **D5** | thủ môn **có** hai nút | ✅ `playerCtl()` không hỏi `who.gk`; `Save Rate` + `Clean Sheets` mang cờ `fixed` vì không phép chia nào áp lên chúng có nghĩa |
| **D6** | **không nhớ** chế độ đọc (phương án a) | ✅ `var mode = 'total'` — không localStorage, không hash |
| **D7** | bỏ `%` khỏi nhãn, dùng `(total)` / `(per 90)` | ✅ mục 4.2.1. Ba tile `fixed` không mang hậu tố, vì không có "total" nào để đối lại "per 90" |

**Còn lại cho lần sau, khi bạn muốn:** D2 (đổi bộ chỉ số — một dòng mỗi tile trong `ROLE_KPIS`),
và lọc số liệu theo vai nếu có lúc bạn đổi ý về D1 — `r.pos.all` đã nằm sẵn trên từng trận, không
phải viết lại phần dữ liệu.

---

## 10. Đã triển khai theo thứ tự nào

| Bước | Việc | Cổng |
|---|---|---|
| 1 | `posFigures()` + `pos:` trong `aggregate()` + khối hằng vai + `per90()` | 1171/1171, màn hình chưa đổi gì |
| 2 | `p.posApps` / `p.pos0` / `p.roles` / `p.role` trong `playerIndex` | vẫn 1171, vẫn chưa đổi gì |
| 3 | `ROLE_KPIS` / `GK_KPIS` / `FALLBACK_KPIS` + closure `row()` | bước duy nhất chạm `player-data.test.js` |
| 4 | `positionBoard()` + `playerCtl()` + `.pl-pos` / `.pl-pz` / `.pl-ctl` + `tail` của `catTabs` + badge | 54 test mới |
| 5 | bump `?v=` → `asset-versions.test.js --update` → `run.js` | **1225/1225** |

**Một chỗ chưa xác minh được, nói thẳng:** chưa mở trang thật trên trình duyệt để nhìn bằng mắt.
Trang này nằm sau đăng nhập và cần một channel đã có report submit, và máy này vốn hay treo ở khâu
chụp màn hình.

Bù lại, 13 test *"vẽ thật"* chạy nguyên `renderPlayerProfile` trong một DOM giả và đọc ngược ra
từng ô: ba ô sáng đúng LM/LW/RW, toạ độ `left`/`top` đúng ô của lưới, và markup SVG thật đã được
in ra kiểm tay một lần (`viewBox 0 0 1050 680`, `pv-dots` đã gỡ, ba nút ở `50%/0%`, `66.7%/0%`,
`66.7%/75%` — khớp ảnh bạn gửi).

Cái chúng **không** nói được là hình ảnh cuối cùng. Đáng liếc mắt ba chỗ khi bạn mở lên:

1. **Màu sân.** `pitchSVG` vẽ sân cỏ xanh; hai rule ở 6.2 đè lại thành `--carbon-2` / `--line-soft`.
   Đây là chỗ tôi kém chắc chắn nhất — nó phụ thuộc vào việc CSS có thắng được presentation
   attribute của SVG hay không (theo chuẩn thì có).
2. **Kích thước chấm và nhãn** trong ô, ở bề rộng 520px và ở mobile.
3. **Ô hàng giữa cao 50%** (CB/CM/CF…) so với hàng biên 25% — chấm sẽ nằm giữa một ô cao gấp đôi.
