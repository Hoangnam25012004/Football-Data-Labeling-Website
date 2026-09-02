# Sửa một trận từ channel — **dropdown "…" → Edit** — Detailed Design

**Mỗi hàng trong bảng Matches (nút Home) có một dropdown `…`, trong đó là nút `Edit`. Form
Edit sửa bốn trường: `date`, `league`, `season`, `round`. Bốn trường đó hiển thị trên bảng
Matches, và trên cả ba tab của trang Data — Overview, Team Data, Player Data.**

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-09-03) — §14 ghi lại những gì lệch khỏi bản thiết kế lúc
làm thật, §15 là việc còn phải làm trên database. Phần thân dưới đây là bản đã duyệt; chỗ nào
nó và §14 nói khác nhau thì **§14 là code đang chạy**.

Nền: `node tests/run.js` → **1424/1424 passed** (2026-09-03).
`0022_match_league_season.sql` **đã chạy** trên production, nên `matches.league` và
`matches.season` đã có thật và `client/assets/supa.js` đã đọc chúng.

**Phạm vi dự kiến:**

| File | Vì sao |
|---|---|
| `supabase/migrations/0023_match_round_and_edit.sql` | cột `round`, **và policy UPDATE có phạm vi** (§2.2 — đây là phần quan trọng nhất) |
| `client/assets/supa.js` | đọc `round`; thêm đường ghi `API.match.update` |
| `client/assets/app.js` | dropdown `…`, form Edit, và bốn chỗ hiển thị |
| `client/assets/app.css` | ô cho dropdown trên hàng, và các dòng meta mới |
| `client/app.html`, `client/guide.html`, `client/login.html` | bump `?v=` |

**Dứt khoát KHÔNG đụng:** `index.html` (tagger), `shared.js`, `Stats/*`, `Player-Lists/*`,
`cloud-sync.js`, `client/assets/site.css`, `auth.js`, `deploy.yml`. Không thêm event, không
thêm counter, không đổi `newStat()` / `EVENT_INC` / `PLAYER_CATS` / `TEAM_SECTIONS` / `GK_COLS`.
§10 liệt kê từng thứ.

---

## 0. Tóm tắt một trang

| | Hôm nay | Sau thay đổi |
|---|---|---|
| Hàng trận trong Matches | một `<button class="mrow">` — bấm đâu cũng mở trận | `<div class="mrow-wrap">` bọc **hàng** và **dropdown `…`** cạnh nhau |
| Sửa thông tin một trận | không có trên site khách; phải vào app tagging | `…` → `Edit` → form bốn trường |
| `matches.round` | không tồn tại | cột `text`, null |
| Ai được sửa | **bất kỳ ai đã đăng nhập, sửa bất kỳ trận nào trong database** (§2.2) | admin (và analyst, nếu duyệt) **của đúng channel chứa trận đó** |
| League / Season / Round trên UI | không đâu cả | 4 màn hình (§5) |
| Migration | — | `0023` |

> **Cảnh báo bảo mật, không phải cảnh báo tính năng.** §2.2 phải được đọc trước mọi mục khác.
> RLS hiện tại cho **mọi tài khoản đã đăng nhập** quyền `UPDATE` **mọi hàng** trong
> `public.matches`. Form Edit sẽ chạy được mà **không cần** migration — và một `viewer` của
> channel này cũng sẽ sửa được trận của câu lạc bộ khác. Migration `0023` tồn tại chủ yếu vì
> lý do đó, không phải vì cột `round`.

---

## 1. Mục tiêu và ranh giới

### 1.1 Phải làm được

1. Trên `#/home`, mỗi hàng trận có một nút `…`. Bấm ra menu, trong menu có `Edit`.
2. `Edit` mở form sửa đúng **bốn** trường: `date`, `league`, `season`, `round`.
3. Lưu xong, giá trị mới xuất hiện ngay trên:
   - bảng **Matches**
   - Data → **Overview**
   - Data → **Team Data**
   - Data → **Player Data**
4. Người không có quyền **không thấy** nút `…`, và dù gọi thẳng URL cũng bị database từ chối.

### 1.2 Dứt khoát KHÔNG đổi

| | |
|---|---|
| Bấm vào hàng vẫn mở trang phân tích trận | `#/match/<slug>` — không đổi một ký tự |
| Bàn thắng, tỉ số, W/D/L | không trường nào trong form chạm tới chúng |
| `competition`, `stage`, `venue`, `our_side`, `published` | không sửa từ đây (§2.4) |
| Mọi con số thống kê | form không chạm `events` hay `match_reports` |
| App tagging | trận vẫn được tạo và tag ở đó; đây chỉ là bốn trường mô tả |

---

## 2. Năm phát hiện phải đọc trước §3

### 2.1 Hàng trận là một `<button>`, và có test khoá chặt điều đó

`renderMatches()` (`client/assets/app.js:169`) dựng mỗi hàng là `el('button', 'mrow')`.
`tests/submit-analysis.test.js:165-172` khoá lại nguyên văn:

```js
ok(/el\('button', 'mrow'\)/.test(APPJS),'a real button, keyboard-reachable for free');
notOk(/setAttribute\('role', 'button'\)/.test(APPJS),'no hand-rolled role');
ok(/class="m-open" aria-hidden="true"/.test(APPJS),'the ▶ is decoration now, not a second target');
```

Comment ngay trên nó nói repo **đã đi qua đúng bài toán này một lần, theo chiều ngược lại**:

> *"it was a div with role and tabindex only because a second control inside it aimed
> somewhere else; with one page per match there is nothing to aim"*

Một `<button>` **không được** chứa `<button>` khác — HTML cấm, và trên thực tế cú bấm vào `…`
sẽ nổi bọt lên hàng và mở luôn trang trận.

**Ba lối ra, và lý do chọn lối thứ ba:**

| | Cách | Vấn đề |
|---|---|---|
| a | quay lại `div[role=button][tabindex]` như trước | phá đúng ba dòng test trên, và mang lại phần xử lý phím tự viết mà repo đã cố ý bỏ |
| b | đặt `…` **trong** `.mrow`, chặn `stopPropagation` | vẫn là `<button>` lồng `<button>`: HTML không hợp lệ, trình duyệt tự sửa DOM theo cách không đoán trước được |
| **c** | **bọc ngoài**: `div.mrow-wrap` chứa `button.mrow` **và** `span.menu-wrap` là hai anh em | `<button>` giữ nguyên, ba test trên vẫn xanh, không cần `role` hay `tabindex` tự viết |

### 2.2 RLS hôm nay: ai đăng nhập cũng sửa được mọi trận

`supabase/migrations/0001_init.sql:64-66`:

```sql
create policy matches_rw on public.matches
  for all to authenticated using (true) with check (true);
```

`for all` gồm cả `UPDATE`; `using (true)` không lọc gì. `0013_client_channels.sql:178-195` có
sẵn một bộ policy chặt hơn nhưng **bị comment toàn bộ** và chưa bao giờ được áp dụng.

Nghĩa là ngay lúc này:

- form Edit sẽ **chạy được mà không cần migration nào** — dễ nhầm là "không cần làm gì";
- một `viewer` của Hanley Town sửa được trận của **mọi** câu lạc bộ khác trong database;
- kể cả trận **chưa publish**, thuộc channel mà họ không phải thành viên.

Đây là lỗ hổng **đã có sẵn**, không phải do tài liệu này tạo ra. Nhưng thêm một nút `Edit`
trên giao diện là biến nó từ "phải tự gọi API" thành "bấm một cái". Nên `0023` phải siết lại
trước, và §12 xếp nó ở bước 1.

Một điểm nữa: RLS là **cấp hàng**, không cấp cột. Cho phép UPDATE hàng là cho phép UPDATE cả
`home_score`, `published`, `club_id`. Postgres có `GRANT UPDATE (cột)` cho việc này, và `0023`
dùng nó để giới hạn đúng bốn cột.

### 2.3 Hai cột ngày, và `shape()` đọc cả hai

`supa.js:610` vùng lân cận đọc `var played = m.kickoff || m.match_date`:

| Cột | Của migration | Ai ghi |
|---|---|---|
| `match_date` | 0011 | hộp thoại tạo trận của **app tagging** |
| `kickoff` | 0013 | seed channel |

Comment trong `supa.js` giải thích vì sao phải đọc cả hai: đọc mỗi `kickoff` là lý do một trận
tag trên site này từng hiện "Date not set".

Nếu form chỉ ghi `kickoff`, hàm đọc lấy `kickoff` trước nên **màn hình đúng ngay** — nhưng
`match_date` ở lại giá trị cũ, và app tagging vẫn đọc cột đó. Hai màn hình, hai ngày. §13-Q4.

### 2.4 `competition` và `stage` đã tồn tại, và **không màn hình nào của site khách vẽ chúng**

`0013` thêm `matches.competition` ("FIFA World Cup 26 Qualifying") và `matches.stage`
("Concacaf Second Round · Group C"). `shape()` map cả hai ra `m.competition` / `m.stage`, và
`grep` trong `client/assets/app.js` cho **không một chỗ nào đọc chúng**.

Comment trong `channelForm()` (`app.js:2002-2007`) còn nói *"the fixture list shows each
match's own"* — điều đó **không đúng với code hiện tại**.

Quan trọng cho §13-Q1: `stage` nghĩa gốc **chính là "round"**. Thêm cột `round` mới sẽ là cột
thứ ba cùng họ nằm im. Nhưng `league`/`season` ở 0022 cũng đã chọn thêm mới thay vì dùng lại
`competition`, nên thêm `round` là **nhất quán với quyết định gần nhất**.

### 2.5 Bảng Matches là lưới 5 track đối xứng, và có test canh từng track

`app.css:202-204`:

```css
.mlist-h,.mrow{--m-cols:minmax(150px,1.1fr) minmax(140px,1.3fr) 96px minmax(140px,1.3fr) minmax(150px,1.1fr)}
```

`tests/client-channels.test.js:610-618` canh: đúng **5** track, track 0 = track 4, track 1 =
track 3, track 2 là px cố định, và cả `.mlist-h` lẫn `.mrow` cùng đọc `--m-cols`. Comment
trong CSS giải thích tại sao: đối xứng quanh tỉ số là thứ đặt scoreline vào **giữa** hàng.

Thêm một track thứ 6 cho `…` sẽ phá đối xứng đó và phá test. §3 vì thế đặt `…` ở **tầng bọc
ngoài**, không phải thành một track của lưới 5.

---

## 3. Dropdown trên hàng trận

### 3.1 Cấu trúc DOM

```
div.mlist
├─ div.mlist-h        ← tiêu đề, 5 cột + một ô trống bằng bề rộng nút
└─ div.mrow-wrap      ← MỚI: lưới 2 cột  [ minmax(0,1fr) | 34px ]
   ├─ button.mrow     ← nguyên như cũ, lưới 5 cột --m-cols bên trong
   └─ span.menu-wrap  ← MỚI, chỉ dựng khi được phép sửa
      ├─ button.mrow-more  "…"
      └─ div.menu[role=menu]
         └─ button.menu-opt  "Edit<em>Date, league, season, round</em>"
```

`menu-wrap` / `menu` / `menu-opt` là **đúng ba class đang có** (`app.css:732-750`), dùng bởi
`settingsMenu()` và dropdown chọn cầu thủ. Không class menu mới, không CSS menu mới — chỉ
`.mrow-wrap` và `.mrow-more`.

### 3.2 Ai thấy nút

```js
var mayEdit = !!(state.user && state.channel &&
                 (state.channel.role === 'admin' || state.channel.role === 'analyst'));
```

- khách chưa đăng nhập xem channel public: `state.user` null → không nút;
- `viewer`: không nút;
- `analyst` / `admin`: có nút.

`state.channel.role` đến từ `club_members` (`supa.js` `clubs()`), tức từ database chứ không
phải từ một cờ client tự đặt. Nhưng nó **chỉ ẩn nút** — hàng rào thật là policy ở §6.

### 3.3 Listener

`settingsMenu()` đã có mẫu đúng và §8 lặp lại nguyên: một listener `document` cho mỗi menu, tự
gỡ khi `wrap.isConnected` thành false. Bảng Matches vẽ lại mỗi lần đổi channel, nên listener
bỏ quên sẽ giữ node đã tháo sống suốt đời trang.

**Một rủi ro riêng của màn hình này:** `settingsMenu` chỉ có **một** menu trên trang; bảng
Matches có **một menu mỗi trận**. 40 trận là 40 listener `document`. §8 vì thế dùng **một
listener duy nhất cho cả danh sách**, gắn trên `.mlist`, đóng mọi menu đang mở — cùng cách
`playerTable()` và `renderTeamData()` đã ủy quyền click cho cả bảng.

---

## 4. Form Edit

### 4.1 Route, không phải modal

Repo chưa có modal nào. Cách sửa đang tồn tại là **một route riêng**:
`settingsMenu()` → `#/channel/<slug>/edit` → `renderChannelEdit()` (`app.js:2120`) →
`channelForm()` (`app.js:1984`).

Thiết kế này đi đúng đường đó: `#/match/<slug>/edit`.

| | Lý do |
|---|---|
| gửi được link | một analyst nhắn cho đồng nghiệp đúng cái form cần sửa |
| Back của trình duyệt hoạt động | modal phải tự dựng lại hành vi đó |
| không có lớp phủ nào phải quản | `#view` được dọn mỗi lần route, nên không rò listener |
| khớp mẫu đang có | `renderChannelEdit` là bản mẫu, kể cả trạng thái "không đủ quyền" |

Router hiện đọc `#/match/<slug>` ở `renderMatchStats`. Thêm nhánh: `rest[1] === 'edit'` →
`renderMatchEdit`, đúng cách `#/channel/<slug>/edit` đang làm (`app.js:1714`).

### 4.2 Bốn trường

| Trường | Kiểu | Ghi vào | Ghi chú |
|---|---|---|---|
| Date | `<input type="date">` | `kickoff` (+ `match_date`, xem §13-Q4) | giá trị `YYYY-MM-DD`, đúng thứ `shortDate()`/`dateLabel()` đang nhận |
| League | `<input list=…>` | `league` | datalist gợi ý từ các league đã có trong channel — gõ tay vẫn được |
| Season | `<input list=…>` | `season` | như trên. Không ép định dạng: `23/24` và `2023-24` đều hợp lệ (§4.4) |
| Round | `<input>` | `round` | tự do: `Round 3`, `Matchday 12`, `Quarter-final` |

Cả bốn **được phép để trống**. Trống nghĩa là "chưa ai nói", và mọi màn hình đọc `—` — đúng
dấu `minsTotal()` và `gkCell()` đã dùng khắp trang.

### 4.3 Datalist lấy từ chính channel

League và Season gõ tay là nguồn của sai chính tả: `Bepro League` và `Bepro league` sẽ thành
hai hàng khác nhau trong bảng Season của trang cầu thủ (`seasonRows()` gom theo chuỗi thô).
Datalist dựng từ `state.matches` — mọi giá trị đã dùng trong channel — làm cho **tái sử dụng
dễ hơn gõ mới**, mà không cấm gõ mới.

Không chuẩn hoá tự động (không `trim().toLowerCase()` rồi so khớp). Nó sẽ âm thầm đổi thứ
người dùng gõ, và một giải đấu **thật sự** có thể phân biệt bằng chữ hoa.

`.trim()` thì có: khoảng trắng đầu/cuối không phải một giải đấu khác.

### 4.4 Không kiểm định dạng Season

`seasonRows()` (§4.3 của `player-season-table-design.md`) đã sắp xếp theo **ngày trận** chứ
không theo chuỗi season, đúng vì `23/24` và `2023-24` đều hợp lệ. Form giữ nguyên nguyên tắc
đó: nó không ép một cách viết mà thứ tự không phụ thuộc vào.

### 4.5 Trạng thái không đủ quyền

Giống hệt `renderChannelEdit`: vào thẳng URL mà chỉ là `viewer` thì thấy `emptyState`
("Not an analyst of this channel"), không thấy form. Và nếu vẫn ghi được request thì `0023`
từ chối — §6.

---

## 5. Bốn trường xuất hiện ở đâu

Bốn màn hình, và mỗi màn hình có một chỗ đúng. Đây là phần **đề xuất**; §13-Q5 để bạn chốt.

### 5.1 Bảng Matches — dòng meta dưới ngày

Hôm nay (`app.js:200-201`):

```
Sunday, 2 August 2026
Away · Match ID 44685
```

Đề xuất — nối vào cùng dòng `.m-date em`, bỏ qua phần nào trống:

```
Sunday, 2 August 2026
Away · Bepro League · 23/24 · Round 3 · Match ID 44685
```

**Không thêm cột.** §2.5: lưới 5 track đối xứng có test canh từng track, và ba trường chữ
không đáng phá đối xứng đó. Dòng meta đã là chỗ dành cho "những gì khác về trận này".

Khi cả ba trống, dòng đọc đúng như hôm nay — không có `—` rải rác.

### 5.2 Data → Overview — hai chỗ

**a. Thẻ Team stats.** Header hiện là `Team stats · <tên channel>`. Thêm dòng phụ nói campaign
đang tính là gì:

- một cặp (league, season) duy nhất → `Bepro League · 23/24`
- nhiều hơn một → `3 competitions` (bấm không được, chỉ là ngữ cảnh)
- không có gì → không vẽ dòng nào

Lý do: Overview cộng **mọi** trận trong channel. Khi channel chứa hai giải, "Average goals
scored" là trung bình trộn hai giải — và không màn hình nào đang nói ra điều đó.

**b. Recent results.** Ô `.rend` hiện có ngày. Thêm `round` phía trên ngày, chữ nhỏ:

```
Round 3
2 Aug 2026
```

Không thêm league/season vào đây: hàng đã là lưới 6 track chật.

### 5.3 Data → Team Data — một cột `Round`

Bảng có 5 cột cố định (Date, Opposing team, Result, Score, Possession) rồi mới tới cột theo
category. Đề xuất thêm **đúng một** cột cố định `Round`, đặt **sau `Date`**.

League và Season **không** thành cột: chúng đổi theo mùa chứ không theo trận, nên in lại trên
mỗi hàng là một cột lặp cùng một chữ. Chúng đã ở dòng phụ của thẻ Team stats (§5.2a), và có
bảng riêng ở Player Data (§5.4).

`Round` thì đổi theo từng trận — đúng thứ một cột nên chứa.

### 5.4 Data → Player Data — hai chỗ

**a. Bảng Season đã có `League` và `Season`.** Sau khi form được dùng, hai cột này **tự có
chữ**, không cần sửa một dòng nào — `seasonRows()` gom theo `(m.league, m.season)` từ đầu.
Đây là phần "đã làm sẵn" ở bản thiết kế trước.

**b. Bảng từng trận của cầu thủ** (`playerMatchTable`) có 5 cột cố định
(Date, vs, Result, Score, Minutes Played). Thêm `Round` **sau `Date`**, đối xứng với §5.3.

> `tests/player-data.test.js` có test *'the match table is Team Data-s five fixed columns,
> with minutes for possession'* canh đúng năm cột đó. Thêm cột thứ sáu **phải sửa test này ở
> cả hai bảng** — và phải sửa cùng nhau, vì test tồn tại để giữ hai bảng giống nhau.

---

## 6. Migration `0023_match_round_and_edit.sql`

```sql
-- ============================================================
--  ROUND, AND WHO MAY EDIT A MATCH
-- ============================================================

-- ---------- 1. cột round ----------
-- Vòng đấu của một trận: "Round 3", "Matchday 12", "Quarter-final". Để null;
-- điền từ form Edit trên site khách. Cùng chỗ với league/season của 0022 vì
-- cùng lý do: một club đá nhiều giải, nên chúng thuộc về TRẬN.
alter table public.matches add column if not exists round text;

-- ---------- 2. siết quyền ghi ----------
-- 0001 đặt matches_rw = for all to authenticated using(true) with check(true).
-- Tức mọi tài khoản đã đăng nhập UPDATE được mọi hàng, kể cả trận của club khác
-- và trận chưa publish. 0013 có sẵn bản chặt hơn nhưng bị comment toàn bộ.
--
-- Thay bằng: đọc như cũ, ghi thì phải là staff, hoặc là admin/analyst của đúng
-- channel chứa trận đó.
drop policy if exists matches_rw on public.matches;

create policy matches_select on public.matches for select to authenticated
  using (true);

create policy matches_insert on public.matches for insert to authenticated
  with check (true);

create policy matches_update on public.matches for update to authenticated
  using (
    public.is_staff()
    or (club_id is not null and exists (
          select 1 from public.club_members m
          where m.club_id = matches.club_id
            and m.user_id = auth.uid()
            and m.role in ('admin','analyst')))
  )
  with check (
    public.is_staff()
    or (club_id is not null and exists (
          select 1 from public.club_members m
          where m.club_id = matches.club_id
            and m.user_id = auth.uid()
            and m.role in ('admin','analyst')))
  );

create policy matches_delete on public.matches for delete to authenticated
  using (public.is_staff());

-- ---------- 3. giới hạn ĐÚNG bốn cột ----------
-- RLS là cấp HÀNG: cho phép UPDATE hàng là cho phép UPDATE cả home_score,
-- published và club_id. Quyền cấp cột là thứ nói được "chỉ bốn cột này".
-- staff đi qua vai trò riêng của họ và không bị bảng dưới đây chạm tới.
revoke update on public.matches from authenticated;
grant  update (kickoff, match_date, league, season, round)
  on public.matches to authenticated;
```

> **Đọc kỹ trước khi chạy.** Bước 2 **thay** một policy đang tồn tại. `matches_select` giữ
> `using(true)` **đúng bằng hành vi đọc hôm nay** — thu hẹp quyền đọc là một thay đổi khác,
> chưa được yêu cầu, và sẽ làm app tagging mất trận. Bước 3 `revoke update` áp cho vai trò
> `authenticated`: **app tagging cũng chạy dưới vai trò đó**, nên nếu nó có ghi cột nào khác
> của `matches` sau khi tạo trận, cột đó phải được thêm vào danh sách `grant`. §13-Q3.

---

## 7. `client/assets/supa.js`

**7.1 — thêm `round` vào `.select()`** (`supa.js:488`), sau `league,season`. Cùng cái bẫy §2.1
của tài liệu trước: gọi tên cột chưa tồn tại làm hỏng **cả câu** và channel về rỗng. `0023`
phải chạy trước.

**7.2 — mang vào object trận** trong `shape()`, cạnh `league` / `season`:

```js
round: m.round || '',
```

**7.3 — đường ghi.** `API.matches` đang là một **hàm** nên không treo `.update` lên nó được.
Thêm một khoá mới:

```js
/* Sửa bốn trường mô tả của một trận từ site khách. Không phải nơi tỉ số hay
   cờ published được đổi: 0023 chỉ cấp quyền UPDATE cho đúng năm cột dưới đây,
   nên một trường thứ sáu lọt vào payload sẽ bị Postgres từ chối chứ không bị
   ghi âm thầm. */
match: {
  update: function (matchUuid, fields) { … }   // -> Promise<void>
}
```

Trả về `Promise` rỗng, không `.select()` trên đường về — đúng lý do `channels.create()` ghi
trong comment của nó: `INSERT/UPDATE … RETURNING` bắt hàng phải qua được policy SELECT trước
khi trả, và đó là nơi một thứ chạy được trong dev hỏng với mọi người khác.

Lỗi đi qua `asError()` như mọi lời gọi khác, để form in ra đúng câu Postgres nói.

---

## 8. `client/assets/app.js`

| | Việc |
|---|---|
| `renderMatches()` | bọc mỗi hàng trong `.mrow-wrap`; dựng `…` khi `mayEdit`; nối league/season/round vào `.m-date em` (§5.1) |
| **mới** `matchMenu(m)` | dropdown một trận, dùng lại `menu-wrap`/`menu`/`menu-opt` |
| **mới** `renderMatchEdit(view, slug)` | form bốn trường, mẫu `renderChannelEdit` |
| **mới** `matchForm(view, opts)` | mẫu `channelForm` |
| **mới** `seasonsOf(matches)` | các cặp (league, season) đã dùng trong channel — cho datalist và §5.2a |
| `route()` | nhánh `#/match/<slug>/edit` |
| `renderOverview()` | dòng phụ trên thẻ Team stats |
| `recentResultsCard()` | `round` trên ô `.rend` |
| `renderTeamData()` | cột `Round` sau `Date` |
| `playerMatchTable()` | cột `Round` sau `Date` |

**Một listener cho cả danh sách, không một listener mỗi hàng** (§3.3):

```js
/* settingsMenu() treo một listener document cho menu duy nhất của nó. Ở đây có
   một menu MỖI TRẬN, nên bốn mươi trận sẽ là bốn mươi listener. Một cái trên
   danh sách, đóng mọi menu đang mở — cùng cách playerTable() ủy quyền click. */
list.addEventListener('click', function (e) { … });
```

**Sau khi lưu** — không tự dựng lại `state.matches` bằng tay từ `fields`:

```js
return window.HNA.match.update(m.uuid, fields).then(function () {
  /* Đọc lại từ database. Ghi đè state bằng đúng thứ vừa gửi đi là tin rằng
     database đã nhận nguyên vẹn — và nó có trigger, có default, có quyền cấp
     cột. loadMatches() cũng dọn state.reports, nên trang Data tính lại thay vì
     vẽ lại cache cũ. */
  return loadMatches(state.channel).then(function () {
    location.hash = '#/home';
    route();
  });
});
```

---

## 9. `client/assets/app.css`

```css
/* Hàng và nút "…" là hai anh em, không lồng nhau: .mrow là <button>, và một
   button không được chứa button. Lưới bọc ngoài giữ .mrow nguyên vẹn với lưới
   5 track đối xứng của nó. */
.mrow-wrap{display:grid; grid-template-columns:minmax(0,1fr) 34px; align-items:center}
.mlist-h{ /* thêm một ô trống cùng bề rộng, để tiêu đề không lệch khỏi cột */ }
.mrow-more{ /* nút "…": nền trong, --ash, sáng lên khi hover hoặc menu mở */ }
@media (max-width:820px){ /* nút giữ nguyên chỗ khi hàng gập xuống hai dòng */ }
```

`.menu-wrap` đã là `position:relative` và `.menu` là `position:absolute; right:0; z-index:30`,
nên menu bung ra đúng dưới nút mà không cần rule mới. `.mlist` không có `overflow` nên không
cắt menu.

Không rule mới cho `.menu*`. Không đổi `--m-cols`.

---

## 10. Không đụng tới — và vì sao

| Thứ | Vì sao đứng yên |
|---|---|
| `--m-cols` và 5 track của nó | §2.5 — đối xứng quanh tỉ số, có test canh từng track. `…` ở tầng bọc ngoài |
| `el('button', 'mrow')` | §2.1 — ba test khoá, và đó là thứ cho bàn phím hoạt động miễn phí |
| `#/match/<slug>` | bấm hàng vẫn mở phân tích trận; chỉ thêm một hậu tố `/edit` |
| `shared.js`, `Stats/*` | không con số thống kê nào đổi. Bốn trường này là mô tả |
| `matches.competition`, `matches.stage` | §2.4 — đã nằm im từ 0013; tài liệu này không dọn chúng, cũng không dùng chúng |
| `home_score` / `away_score` / `published` / `club_id` | `grant update (…)` ở §6 chỉ cấp năm cột; năm cột đó không gồm chúng |
| `matches_select` | giữ `using(true)` — thu hẹp quyền đọc là thay đổi khác chưa được yêu cầu |
| App tagging (`index.html`) | trận vẫn tạo và tag ở đó. §13-Q3 là câu hỏi để nó không mất quyền ghi |
| `deploy.yml` | không file runtime mới |

---

## 11. Test

Nền **1424/1424**. Ước tính **+38**, và **4 test phải sửa**.

### 11.1 Phải sửa

| File | Test | Vì sao |
|---|---|---|
| `tests/submit-analysis.test.js:164` | `'a row opens the analysis, and is a button again'` | thêm vế: `.mrow` vẫn là `<button>`, và `…` là **anh em** chứ không nằm trong nó |
| `tests/client-channels.test.js:610` | lưới 5 track | thêm vế: `.mrow-wrap` là lưới bọc ngoài, `--m-cols` **không đổi** |
| `tests/player-data.test.js` | `'the match table is Team Data-s five fixed columns…'` | thành sáu, ở **cả hai** bảng — test này tồn tại để giữ hai bảng giống nhau |
| `tests/data-page.test.js:189` | `'Team Data is the matches and nothing else'` | kiểm lại danh sách cột cố định |

### 11.2 Test mới — `tests/match-edit.test.js` (~38)

**Dropdown (7)** — `…` là anh em của `.mrow` chứ không nằm trong; `.mrow` vẫn là `<button>`;
menu dùng lại `menu-wrap`/`menu`/`menu-opt`; đúng **một** listener cho cả danh sách; menu
không xuất hiện với `viewer`; không xuất hiện khi chưa đăng nhập; `--m-cols` vẫn 5 track.

**Form (9)** — đúng bốn trường, không hơn; cả bốn được để trống; `type="date"` nhận và trả
`YYYY-MM-DD`; `.trim()` được áp; không chuẩn hoá hoa/thường; datalist dựng từ `state.matches`;
`viewer` vào thẳng URL thấy empty state; huỷ không ghi gì; lưu xong gọi `loadMatches` chứ
không vá `state` tại chỗ.

**Hiển thị (10)** — dòng meta bỏ qua phần trống và đọc đúng như hôm nay khi cả ba trống; thứ
tự `venue · league · season · round · Match ID`; Overview in một cặp khi chỉ có một, `N
competitions` khi nhiều hơn, không gì khi trống; `Round` là cột thứ hai của cả Team Data lẫn
bảng trận của cầu thủ; ô trống đọc `—`.

**Migration (8)** — `0023` chỉ `add column if not exists` cho `round`; `matches_select` giữ
`using(true)`; `matches_update` đòi staff **hoặc** `club_members.role in ('admin','analyst')`
**của đúng `club_id`**; `with check` giống hệt `using` (nếu không, một hàng có thể được đẩy
sang channel khác); `grant update` đúng năm cột và **không** gồm `home_score`, `published`,
`club_id`; `matches_rw` bị drop.

**Không hỏng chỗ khác (4)** — `shared.js` không đổi; `GK_COLS`/`PLAYER_CATS`/`TEAM_SECTIONS`
không đổi; `#/match/<slug>` vẫn mở phân tích; `seasonRows()` vẫn gom đúng khi league/season có
chữ thật (test này chạy `seasonRows` với dữ liệu như sau khi form được dùng — chính là thứ
`tests/player-season-table.test.js` đã dựng sẵn fixture).

---

## 12. Thứ tự triển khai

1. **Chạy `0023`** trên production. Không thể đổi chỗ với bước 3: `supa.js` gọi `round` tường
   minh, và cột chưa có làm hỏng cả câu → channel rỗng (§7.1).
2. Kiểm: `select round from public.matches limit 1;` trả `null`, không lỗi.
   Kiểm quyền: đăng nhập bằng một tài khoản `viewer` và thử `update` một trận — phải bị từ chối.
   Kiểm app tagging: tạo một trận mới và lưu — nếu hỏng, xem §13-Q3.
3. Sửa code, `node tests/run.js` cho tới khi xanh.
4. `node tests/asset-versions.test.js --update`, rồi bump `?v=`:

| File | v hiện tại | v mới | Trang |
|---|---|---|---|
| `client/assets/app.js` | 51 | **52** | `client/app.html` |
| `client/assets/app.css` | 21 | **22** | `client/app.html`, `client/guide.html`, `client/login.html` |
| `client/assets/supa.js` | 14 | **15** | `client/app.html`, `client/login.html` |

`shared.js` không đổi (v=27). `client/login.html` cũng tải `supa.js` — chỗ dễ quên nhất, và
test bắt được.

5. Deploy. Không file runtime mới nên `deploy.yml` không cần sửa.

---

## 13. Câu hỏi cần duyệt

**Q1 — `round` là cột mới, hay dùng lại `stage`?** (§2.4)
  - **(a)** cột `round` mới. Nhất quán với 0022; `stage` ở lại nằm im. **Đề xuất.**
  - **(b)** dùng lại `matches.stage` — nghĩa gốc của nó chính là vòng đấu. Không migration cho
    cột, nhưng seed Saint Lucia đang có chữ trong đó, nên "để trống" không còn đúng.

**Q2 — Ai được sửa?**
  - **(a)** `admin` và `analyst`. **Đề xuất** — analyst là người tag trận và biết nó thuộc
    vòng nào.
  - **(b)** chỉ `admin`. Chặt hơn, khớp với `renderChannelEdit`.

**Q3 — `revoke update on public.matches from authenticated` có làm hỏng app tagging không?**
Đây là câu **duy nhất tôi không tự trả lời được** và cần bạn kiểm. App tagging chạy dưới cùng
vai trò `authenticated`. Nếu sau khi tạo trận nó còn `UPDATE` cột nào của `matches`
(ví dụ `config` khi đặt Duration, hay `home_score`), cột đó phải nằm trong danh sách `grant`.
  - **(a)** tôi thêm `config`, `home_score`, `away_score`, `venue`, `our_side`, `published`,
    `competition`, `stage`, `home_team_id`, `away_team_id`, `lineups` vào `grant` — tức mọi cột
    app tagging có thể chạm. Khi đó `grant` không còn giới hạn được gì nhiều, nhưng
    `matches_update` vẫn chặn theo hàng. **An toàn nhất cho app tagging.**
  - **(b)** giữ đúng năm cột, và **bạn kiểm app tagging ở bước 2 của §12** trước khi đi tiếp.
    **Đề xuất**, vì đó là phần thật sự bảo vệ tỉ số.

**Q4 — ghi ngày vào cột nào?** (§2.3)
  - **(a)** ghi **cả hai** `kickoff` và `match_date`. Site khách và app tagging không bao giờ
    lệch ngày. **Đề xuất.**
  - **(b)** chỉ `kickoff`. Diff nhỏ hơn, nhưng app tagging vẫn đọc `match_date` cũ.

**Q5 — bốn chỗ hiển thị ở §5, bạn duyệt như đề xuất chứ?**
  - Matches: nối vào dòng meta dưới ngày, **không** thêm cột
  - Overview: một dòng phụ trên thẻ Team stats + `round` trên Recent results
  - Team Data: **một** cột `Round` sau `Date` (league/season không thành cột)
  - Player Data: bảng Season đã có League/Season sẵn + một cột `Round` sau `Date`

---

## 14. Đã triển khai

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-09-03). §13 chốt: **Q1 = cột mới**, **Q2 = chỉ admin**,
**Q3 = (b)**, **Q4 = (a)**, **Q5 = như đề xuất**.

Test: `node tests/run.js` → **1453/1453 passed** (1424 trước đó, +29 ở
`tests/match-edit.test.js`, và 1 test cũ được viết lại).

### 14.1 Q2 = chỉ admin — khác gì so với §3.2 và §6

- `mayEdit = state.user && state.channel && state.channel.role === 'admin'` — bỏ `'analyst'`.
- Policy dùng thẳng `public.is_club_admin(club_id)` của 0014 thay vì tự viết `exists (…)`.
  Nó là `security definer`, nên không vướng RLS của chính `public.club_members` khi được gọi
  từ trong policy.
- Empty state đọc "Not an admin of this channel", cùng câu `renderChannelEdit` dùng.

### 14.2 Một điều bản thiết kế nói sai, và đo trên trình duyệt mới thấy

§5.3 và §5.4 nói đặt cột `Round` **ngay sau `Date`**. Làm đúng như thế thì **hỏng**:

`.c-date` (`left:0`, 104px) và `.c-opp` (`left:104px`) là một **cặp cột đóng băng**, và một
dải sticky **phải liền nhau tính từ mép trái**. Chèn `Round` vào giữa thì nó cũng phải sticky
với một `left` cố định — nhưng **một cột bảng tự nở ra vừa nội dung của nó**. Đã cấp 82px;
`"Matchday 12"` làm cột rộng **97px**; `.c-opp` ghim ở `186px` nằm đè lên 15px chữ. Nhìn thấy
trên trình duyệt, không phải đoán:

```
noOverlap: false   ·   rnd: {w: 97, left: "104px"}   ·   opp: {left: "186px"}
```

Sửa: `Round` là cột **đầu tiên NGAY SAU cặp đóng băng**, không thuộc cặp đó.
`.c-opp` trở lại `left:104px` — **đúng như trước thay đổi này**, nên toàn bộ CSS cột đóng băng
và hai test canh nó không bị đụng tới. Thứ tự đọc là `Date · Opposing team · Round · Result …`,
và Round vẫn là thứ đầu tiên sau cặp đấu.

Đo lại sau khi sửa: `frozenPairIntact: true`, `noOverlap: true`, `orderLeftToRight: true`.

### 14.3 `matchForm` không stopPropagation, và đó là chủ ý

§3.1 để `…` là **anh em** của `.mrow` chứ không nằm trong nó. Hệ quả: cú bấm vào `…` **không
bao giờ đi qua** hàng, nên hàng không mở trận — không cần `stopPropagation`. Và **không được**
gọi nó: chặn sự kiện thì nó không tới được listener của danh sách, tức menu đang mở ở hàng
khác sẽ không đóng.

### 14.4 Thêm ngoài phạm vi §7: `asError` hiểu 42703

`supa.js` giờ dịch `42703` ("column … does not exist") thành một câu nói rõ là thiếu migration
— cùng dịch vụ mà `42P01` đã có từ trước. Đó chính xác là cái bẫy §2.1 và §7.1 mô tả: gọi tên
`round` khi 0023 chưa chạy làm hỏng **cả câu**, và `.catch()` biến nó thành channel rỗng.

### 14.5 Cache-bust

`app.js` **51 → 52**, `app.css` **21 → 22**, `supa.js` **14 → 15**. `shared.js` (v=27) không
đổi. `client/login.html` cũng tải `supa.js` — chỗ §12 đã nhắc, và test bắt được.

### 14.6 Đã xác minh trên trình duyệt

Dựng bằng chính `renderMatches()` / `renderMatchEdit()` chạy thật rồi serialize ra HTML tĩnh,
tải đúng `site.css` + `app.css`.

| Kiểm tra | Kết quả |
|---|---|
| Hàng trận | `BUTTON.mrow`, và `SPAN.menu-wrap` là **anh em** trong `DIV.mrow-wrap` |
| Lưới 5 track | tiêu đề và hàng **giống hệt nhau**: `228.9 / 270.6 / 96 / 270.6 / 228.9` |
| Mép phải | tiêu đề kết thúc đúng chỗ hàng kết thúc (`margin-right:34px`) |
| Dòng meta có dữ liệu | `Away · Bepro League · 23/24 · Round 3 · Match ID 44685` |
| Dòng meta trống | `Home · Match ID 44687` — **đúng như trước khi có tính năng này** |
| Menu | mở dưới `…`, nằm trong khung nhìn, đọc `Edit / Date, league, season, round` |
| Form | `date=2026-08-02`, ba ô còn lại có `list=` trỏ đúng datalist |
| `seasonsOf` | `[{"league":"Bepro League","season":"23/24"}]` — bỏ qua trận chưa gán |
| Bảng có cột Round | `Date · Opposing team · Round · Result · Score · …`, `—` khi trống |
| Cặp đóng băng | nguyên vẹn, không đè, `tfoot` thẳng cột với `tbody` |

---

## 15. Còn lại phải làm: chạy 0023, rồi KIỂM APP TAGGING

**`supabase/migrations/0023_match_round_and_edit.sql` chưa chạy.** Code đã lên, và
`client/assets/supa.js?v=15` gọi `round` tường minh — chưa chạy migration thì channel về rỗng.

Sau khi chạy, kiểm **ba** thứ (đầu file migration cũng ghi):

1. `select round from public.matches limit 1;` → `null`, không lỗi
2. đăng nhập bằng một tài khoản **viewer** rồi thử `update` một trận → phải bị từ chối
3. **mở app tagging, tạo một trận và lưu.**

Bước 3 là hệ quả của **Q3 = (b)**. `revoke update on public.matches from authenticated` áp cho
vai trò mà **app tagging cũng chạy dưới**. Nếu sau khi tạo trận nó còn `UPDATE` cột nào khác
của `public.matches` — `config` khi đặt Duration, `home_score` khi sửa tỉ số, `lineups`,
`home_team_id`… — thao tác đó sẽ báo:

```
permission denied for table matches
```

Cách sửa khi gặp: thêm cột nó cần vào danh sách `grant` ở cuối `0023` rồi chạy lại **hai câu
cuối**. `matches_update` ở phần 2 vẫn là hàng rào thật và không đổi.
