# Player Role Cards — Detailed Design

**Hàng 6 card trong profile cầu thủ (Data → Player Data) tách theo vai: Defender / Midfielder /
Striker, thay vì một bộ dùng chung cho mọi cầu thủ ngoài sân. Ai đá nhiều vị trí thì có chip
filter để chọn vai. Cạnh đó là hai nút đọc số: `Total` và `Per 90 mins`.**

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-08-19). Tài liệu này mô tả code đang chạy.

Test: `node tests/run.js` → **1214/1214 passed**
(1171 test cũ — trong đó 1170 không sửa một ký tự — cộng 43 test mới ở `tests/player-role-cards.test.js`).

Đã sửa: `client/assets/app.js`, `client/assets/app.css`, `client/app.html`,
`client/login.html` (cache-bust), `tests/asset-versions.json`, `tests/player-data.test.js` (5 dòng).
**Không chạm:** `index.html` (tagger), `shared.js`, `shared.css`, `Stats/*`, `Player-Lists/*`,
`cloud-sync.js`, `client/assets/supa.js`, `client/assets/site.css`, `deploy.yml`,
không migration DB, không thêm file runtime mới.

**Bốn quyết định của bạn, đã thi hành:**

| | | Kết quả trong code |
|---|---|---|
| **D5** | thủ môn **có** hai nút Total / Per 90 | `GK_KPIS` đi qua đúng một builder với ba bộ còn lại; `playerCtl()` không hỏi `who.gk` một lần nào |
| **D6** | **không nhớ** chế độ đọc (phương án a) | `var mode = 'total'` — không localStorage, không hash. Mở một cầu thủ là nhìn cả chiến dịch |
| **D7** | bỏ `%` khỏi nhãn, dùng `(total)` / `(per 90)` | mọi tile đếm được đều mang hậu tố; phần trăm xuống dòng chú thích, nơi nó không đổi theo chế độ |
| D3, D4 | thẻ phạt xuống meta, badge vai | như đã duyệt |

> **Một chỗ D7 không áp dụng được, và vì sao.** `Save Rate` là một tỉ lệ và `Clean Sheets` đếm
> theo **trận** chứ không theo phút — chia chúng cho số phút cho ra đại lượng vô nghĩa. Hai tile
> đó mang cờ `fixed`: giữ nguyên nhãn, giữ nguyên giá trị ở cả hai chế độ. `Cards` (`0Y · 0R`)
> trong bộ dự phòng cũng vậy. Ba tile, và chỉ ba, có một test riêng canh đúng con số đó.

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
3. Một cầu thủ có **≥ 2 vai** trong cả chiến dịch → hiện một hàng chip filter phía trên hàng card.
   Chỉ **một** vai → không có chip (không bày ra một nút chỉ có một lựa chọn).
4. **Hai nút đọc số** cạnh hàng chip: `Total` (mặc định) và `Per 90 mins` (cùng những con số
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
      /* Ba vai, đếm theo hai cách khác nhau vì chúng trả lời hai câu hỏi khác nhau.
         `roleApps` là "anh từng đá vai này bao nhiêu trận" — nó quyết định chip nào hiện ra.
         `picked` là "anh được XẾP vào vai này bao nhiêu trận" — nó quyết định chip nào
         sáng khi vừa mở trang. Một hậu vệ dâng lên đá tiền vệ mười phút cuối vẫn là hậu vệ. */
      var apps = {}, picked = {};
      p.matches.forEach(function (r) {
        if (!r.pos) return;
        var seen = {};
        (r.pos.all || []).forEach(function (ps) {
          var role = ROLE_OF[ps];
          if (role && !seen[role]) { seen[role] = 1; apps[role] = (apps[role] || 0) + 1; }
        });
        var p0 = ROLE_OF[r.pos.start];
        if (p0) picked[p0] = (picked[p0] || 0) + 1;
      });
      p.roleApps = apps;
      /* Thứ tự cố định — Defender, Midfielder, Striker — chứ không phải thứ tự bắt gặp.
         Hàng chip của một người không được đổi chỗ giữa hai lần mở trang. */
      p.roles = ROLES.filter(function (r) { return apps[r[0]]; }).map(function (r) { return r[0]; });
      p.role = p.roles.slice().sort(function (x, y) {
        return (picked[y] || 0) - (picked[x] || 0) ||        // được xếp vào nhiều nhất
               (apps[y] || 0) - (apps[x] || 0) ||            // rồi ra sân nhiều nhất
               ROLE_RANK[x] - ROLE_RANK[y];                  // rồi thứ tự cố định
      })[0] || '';
```

`p.role` là **vai mặc định**; `p.roles` là danh sách chip (đã theo thứ tự cố định);
`p.roleApps` cho số trận mỗi vai (dùng cho tooltip chip, mục 5.2).
`p.role === ''` nghĩa là **không biết vai** — hợp lệ và có đường đi riêng (mục 3.4).

`p.gk` vẫn được tính đúng như cũ và **đi trước** `p.role` ở mọi chỗ hiển thị.

### 3.4 Bốn trường hợp biên, và câu trả lời cho từng cái

| Tình huống | Kết quả |
|---|---|
| **Thủ môn kiêm cầu thủ** (một trận ô GK, một trận CB) | `p.gk = true` (luật cũ: một trận ở ô GK là đủ cho cả chiến dịch). Anh ta giữ **bộ tile thủ môn** và **không** có chip vai. Hai nút đọc số thì có, như mọi người. |
| **Đá 3 vai** trong cả chiến dịch | 3 chip. Nhiều nhất là 3, hàng chip không thể tràn. |
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
var ROLE_OF = {}, ROLE_LABEL = {}, ROLE_BADGE = {}, ROLE_RANK = {};
ROLES.forEach(function (r, i) {
  ROLE_LABEL[r[0]] = r[1]; ROLE_BADGE[r[0]] = r[2]; ROLE_RANK[r[0]] = i;
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

## 5. Bộ lọc vai và hai nút đọc số

### 5.1 Chỗ đứng trên màn hình

```
┌──────────────────────────────────────────────────────────┐
│  Elva                        [DEF]           PLAYER ▼    │   ← .pl-head  (badge = vai ĐANG xem)
│  4 appearances · 360' · 7 Jun 2024 → 11 Jun 2025 · 0Y·0R │   ← .pl-meta  (thẻ xuống đây)
└──────────────────────────────────────────────────────────┘
  POSITION [DEFENDER] [Midfielder]        [TOTAL] [Per 90]     ← .pl-ctl  (MỚI)
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ APPS   │MINUTES │TACKLES │INTERC. │CLEARAN.│ DUELS  │
│        │        │WON     │(TOTAL) │(TOTAL) │WON     │       ← .kpis.six  (bố cục KHÔNG đổi)
│        │        │(TOTAL) │        │        │(TOTAL) │
│  4     │  360'  │   9    │   14   │   21   │   31   │
│        │        │64.3%   │balls   │balls   │58.5%   │
│        │        │of 14   │cut out │put away│of 53   │
└────────┴────────┴────────┴────────┴────────┴────────┘
  [Shooting] [Distribution] [Defensive] [Other]                ← .dsubs  (KHÔNG đổi)
  ─ bảng theo trận ─                                           ← KHÔNG đổi, không bị lọc
```

**Một thanh điều khiển, hai nhóm.** Trái là bộ lọc vai (chỉ khi ≥2 vai), phải là hai nút đọc số
(`margin-left:auto`, luôn có). Chúng nằm chung một thanh chứ không phải hai hàng, vì hai nhóm chip
chồng nhau đọc thành hai tầng tab — mà ngay dưới hàng card đã có tầng tab category thật rồi.

**Vì sao hai nhóm khác màu.** Chip vai dùng sắc **hổ phách**, cùng sắc với badge `DEF` cạnh tên —
mắt nối được chip đang sáng với badge. Hai nút đọc số dùng sắc **đỏ** mặc định của `.chip.on`,
như mọi thứ khác trong app.

### 5.2 `playerCtl()` — builder mới

```js
/* The bar over the tiles: which role on the left, which reading on the right.

   One bar rather than two rows — two rows of chips stacked read as two tiers of
   tabs, and there is already a real tier of category tabs under the tiles.

   The role group is only built when there are at least two to choose between: a
   button with one option is not a filter, it is a label, and that label is
   already sitting beside his name. The reading group is always there, because it
   does not depend on his role — only on whether there are minutes to divide by.

   It draws nothing itself. The caller passes `onMode`, so the only place that
   knows how to build a row of tiles stays renderPlayerProfile(). */
function playerCtl(who, cat, role, onMode) {
  var bar = el('div', 'pl-ctl');

  if (who.roles && who.roles.length > 1) {
    var left = el('div', 'pl-grp');
    left.appendChild(el('span', 'pl-grp-l', 'Position'));
    var base = '#/data/player/' + encodeURIComponent(who.key) + '/' + cat + '/';
    who.roles.forEach(function (r) {
      var b = el('button', 'chip role' + (r === role ? ' on' : ''), esc(ROLE_LABEL[r]));
      b.type = 'button';
      /* The match count lives in the tooltip rather than on the chip: a role has
         to be readable in one glance, and that number is not something to
         compare one chip against another with. */
      b.title = who.roleApps[r] + (who.roleApps[r] === 1 ? ' match' : ' matches') +
                ' in this position';
      b.addEventListener('click', function () { location.hash = base + r; });
      left.appendChild(b);
    });
    bar.appendChild(left);
  }

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

#### 5.2.1 Sáu ô ở nguyên trong `renderPlayerProfile`

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

### 5.3 Vai sống trong URL

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

### 5.4 `catTabs` phải giữ được vai khi bấm chip category

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

### 5.5 Dropdown đổi cầu thủ: giữ category, **bỏ** vai

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
| 6 | `playerIndex()` | thêm `pos:` vào record mỗi trận; tính `p.roleApps`, `p.roles`, `p.role` |
| 7 | `renderPlayerData` | truyền `rest[3]` xuống |
| 8 | `renderPlayerProfile` | chữ ký `(body, who, people, wanted, wantedRole)`; chốt `role`; `mode`; closure `row()`; chèn `playerCtl()`; truyền `tail` cho `catTabs` |
| 9 | `playerHead` | chữ ký `(who, people, cat, role)`; badge vai; điều kiện dòng thẻ |
| 10 | cạnh `renderPlayerProfile` | **builder mới** `playerCtl()` |

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
/* ---------- Player Data: thanh điều khiển của một cầu thủ ----------
   Trái là vai (chỉ khi có nhiều hơn một), phải là cách đọc số. Một thanh chứ không
   phải hai hàng: hai hàng chip chồng nhau đọc thành hai tầng tab, mà ngay dưới hàng
   card đã có tầng tab category thật rồi.
   Trên màn hẹp cả thanh xuống dòng và `margin-left:auto` mất tác dụng — đúng ý:
   hai nhóm xếp chồng, mỗi nhóm vẫn đứng liền khối của nó. */
.pl-ctl{display:flex; align-items:center; flex-wrap:wrap; gap:10px 14px; margin:0 0 14px}
.pl-grp{display:flex; align-items:center; flex-wrap:wrap; gap:7px; min-width:0}
.pl-grp.right{margin-left:auto}
.pl-grp-l{
  font-family:var(--f-mono); font-size:9.5px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--ash-dim); margin-right:3px;
}
/* Chip vai lấy sắc hổ phách của badge cạnh tên, để mắt nối được hai thứ với nhau.
   Hai nút đọc số giữ sắc đỏ mặc định của .chip.on, như mọi nút khác trong app. */
.pl-ctl .chip.role.on{border-color:var(--amber); color:var(--amber)}
/* Per 90 mins khi không có phút nào để chia (mục 4.4.4) */
.pl-ctl .chip[disabled]{opacity:.4; cursor:not-allowed}
```

Sáu selector, tất cả đều bắt đầu bằng `.pl-ctl` hoặc `.pl-grp` — hai tên **chưa từng xuất hiện**
trong `site.css`, `app.css`, `shared.css` hay `Stats/stats-view.css`, nên **không có cách nào một
trang khác dính vào**. `.chip` mượn nguyên từ `site.css:193` (file không đụng tới), và
`.chip.role.on` chỉ thắng `.chip.on` nhờ cụ thể hơn — không ghi đè, không `!important`.

### 6.3 Cache-busting — đã làm

| File | Trước | Sau | Sửa ở |
|---|---|---|---|
| `client/assets/app.js` | `?v=33` | **`?v=34`** | `client/app.html:81` |
| `client/assets/app.css` | `?v=16` | **`?v=17`** | `client/app.html:9` **và** `client/login.html:8` |

`app.css` được **hai** trang nạp — bump một, quên một là trang login giữ CSS cũ. Xong rồi chạy
`node tests/asset-versions.test.js --update` để dựng lại manifest.

`shared.js` (`?v=21`) **không đổi** → `Stats/index.html:62`, `Player-Lists/index.html:98`,
`app.js` đều đứng yên. Không thêm file mới → `deploy.yml` không phải sửa.

---

## 7. Test

```bash
node tests/run.js
```

→ **1214/1214 passed** = 1171 test cũ + 43 test mới.

### 7.1 `tests/player-role-cards.test.js` — 43 test mới

Chia làm hai nửa. Nửa đầu **chạy thật** `posFigures`, `playerIndex`, `per90` và các bảng tile
trong vm. Nửa sau đọc phần render bằng source — **cộng sáu test vẽ thật cả trang** trong một DOM
nhỏ, vì regex trên source không bắt được một tên ngoài phạm vi hay một trường đọc trên `undefined`.

| Nhóm | Số test | Canh cái gì |
|---|---|---|
| Bản đồ ô → vai | 3 | 15 ô ngoài GK đều có đúng **một** vai; `GK` không có vai nào; ba nhóm khớp từng chữ với bảng bạn đưa |
| Bảng tile | 5 | `ROLE_KPIS` đúng ba khoá; mỗi bộ đúng 4 tile; cả 20 tile chạy được trên `newStat()` rỗng ở **cả hai chế độ**; không tile nào tự khai `%`/`total`/`per 90` trong nhãn; đúng **ba** tile `fixed`; `Shots On Target` bằng đúng cột *Shooting Accuracy* của `shared.js` |
| `posFigures` | 6 | XI xuất phát; người vào sân thay lấy ô người ra; đổi ô giữa trận giữ cả hai; **snapshot ngược thứ tự `t` vẫn ra đúng ô xuất phát**; ô chờ bị bỏ qua; không lineups không ném |
| `playerIndex` | 7 | một vai; hai vai đúng thứ tự cố định; đổi vai trong một trận; ba ô cùng vai vẫn là **một** trận; **vai mặc định không phụ thuộc thứ tự trận**; không đội hình → không vai; thủ môn không đổi một số nào |
| `per90` | 5 | phép chia; bốn cửa ra `'—'`; tiền tố `~`; tỉ lệ đứng yên còn mẫu số đi theo; hai ô trái không bao giờ bị chia |
| Cái được vẽ | 11 | một builder ba bộ tile, thủ môn hỏi trước; `mode` không vào hash và không vào localStorage; thủ môn có nút, không có chip; `Per 90` bị disable đúng lúc và **không được gắn listener**; href chip mang đủ category + vai; `catTabs` giữ tail còn Team Data không; badge; bảng theo trận không bị lọc; không số áo; CSS mang đúng tên mới; không listener nào trên `document` |
| **Vẽ thật** | 6 | hồ sơ hậu vệ ra đúng 6 nhãn + 6 giá trị; bấm `Per 90` đổi nhãn và chia đúng (`21 → 5.3`); thủ môn ra `Save Rate` / `Clean Sheets` **không hậu tố**; người không vai ra đúng trang cũ; hai vai ra hai chip với `title` đúng số trận; không phút thì nút bị khoá |

### 7.2 `tests/player-data.test.js` — sửa **5 dòng**, 49/50 test không đổi một ký tự

| Dòng | Việc |
|---|---|
| 37, 38 | nới hai regex chữ ký thành `\([^)]*\)` — lần sau đổi tham số không phải sửa nữa |
| 47-48 | thêm `posFigures`, `per90` vào `LIFT`; thêm `ROLEBLOCK` (khối hằng vai, lấy nguyên khối) vào sandbox |
| 530, 534 | hai assertion so khớp `kpi('Saves'` / `kpi('Goals'` trong thân hàm → nay so khớp `GK_KPIS` và `FALLBACK_KPIS`. **Nội dung khẳng định y nguyên**, chỉ đổi chỗ nhìn |
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
| Player Data → **thủ môn** | `who.gk` hỏi **trước** ở cả ba chỗ còn phân biệt (bộ tile, chip vai, badge). Bốn tile của anh ta không đổi một chữ; hai tile `fixed` không đổi kể cả khi bấm `Per 90`. |
| Player Data → **bảng theo trận** | `playerMatchTable(who, cat)` không sửa, không nhận `role`, không nhận `mode`. Có test canh rằng ba chữ đó không xuất hiện trong hàm. |
| **Link cũ** `#/data/player/KEY/defensive` | `rest[3] === undefined` → rơi về `who.role`. Không redirect, không trang trắng. Route vẫn dừng ở 4 đoạn. |
| Report **không có lineups** | `pos = null` xuyên suốt → `role = ''` → `FALLBACK_KPIS` = đúng hàng card hôm nay, thẻ phạt vẫn ở tile. Có test **vẽ thật** kiểm 6 nhãn + 6 giá trị của trường hợp này. |
| Đăng nhập / route khác (`#/channels`, `#/match/…`) | Không chạm `route()`. |
| Rò rỉ listener | `playerCtl` chỉ gắn listener lên chính các `<button>` nó dựng — không có listener trên `document`, nên không có gì phải gỡ. Nút `disabled` không được gắn listener nào cả. Cả hai đều có test. |
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
| 2 | `p.roles` / `p.role` / `p.roleApps` trong `playerIndex` | vẫn 1171, vẫn chưa đổi gì |
| 3 | `ROLE_KPIS` / `GK_KPIS` / `FALLBACK_KPIS` + closure `row()` | bước duy nhất chạm `player-data.test.js` |
| 4 | `playerCtl()` + `.pl-ctl` + `tail` của `catTabs` + badge + dòng meta | 43 test mới |
| 5 | bump `?v=` → `asset-versions.test.js --update` → `run.js` | **1214/1214** |

**Một chỗ chưa xác minh được, nói thẳng:** chưa mở trang thật trên trình duyệt để nhìn bằng mắt.
Trang này nằm sau đăng nhập và cần một channel đã có report submit, và máy này vốn hay treo ở khâu
chụp màn hình. Bù lại, sáu test *"vẽ thật"* chạy nguyên `renderPlayerProfile` trong một DOM giả và
đọc ngược ra 6 nhãn + 6 giá trị của từng trường hợp — đủ để nói **logic** đúng. Cái chúng **không**
nói được là CSS trông ra sao trên màn hình thật; mục cần liếc là thanh `.pl-ctl` ở bề rộng hẹp và
nhãn hai dòng như `TACKLES WON (TOTAL)`.
