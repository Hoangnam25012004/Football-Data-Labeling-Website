# Lưu trận không tới database — `permission denied for table matches` — Detailed Design

**Từ đầu tháng 9/2026, KHÔNG một thứ gì app tagging ghi lên `public.matches` tới được
database nữa: đội hình (`lineups`), Duration (`config`), tên hai đội (`home_name`/`away_name`)
và video dùng chung (`video_url`). Tất cả chỉ còn nằm trong `localStorage` của đúng một
trình duyệt. Trang Player lists nói ra lỗi; app tagging nuốt lỗi vào `console.warn`, nên nó
im lặng suốt một tuần.**

Trạng thái: **CODE ĐÃ TRIỂN KHAI** (2026-09-10) — **migration `0025` CHƯA CHẠY**, xem §14.5.
§14 ghi lại những gì lệch khỏi bản thiết kế lúc làm thật (đáng chú ý: §14.1 — Bug 2 hoá ra
có **hai** nguyên nhân, không phải một). Phần thân dưới đây là bản đã duyệt; chỗ nào nó và
§14 nói khác nhau thì **§14 là code đang chạy**.

Nền: `node tests/run.js` → **1523/1523 passed** trước khi sửa, **1541/1541** sau khi sửa.

**Phạm vi dự kiến:**

| File | Vì sao |
|---|---|
| `supabase/migrations/0025_match_tagging_columns.sql` | **mới** — trả lại quyền ghi 5 cột app tagging cần, và mở `matches_update` cho người tạo trận |
| `cloud-sync.js` | không nuốt lỗi nữa (§6.2 C1); một bản `lineups` rỗng trên cloud không được đè bản tốt ở máy (§6.2 C2) |
| `Player-Lists/index.html` | cùng luật "rỗng không đè" ở `loadMatchLineups()` (§6.2 C2) |
| `shared.js`, `index.html` | `saveLineupsLS()`/`writeLineupsLS()` trả `false` thật khi localStorage ném lỗi (§6.2 C3) |
| `tests/…` | 4 test mới (§8) |
| `tests/asset-versions.json` + `?v=` | bắt buộc khi 4 file trên đổi (§7 bước 6) |

**Dứt khoát KHÔNG đụng:** `supabase/migrations/0023`, `0024` (§6.1.4 nói vì sao),
`client/assets/*` (site khách), `Stats/stats-view.js`, `Stats/report.js`, `auth.js`,
`deploy.yml`. Không thêm/bớt event, không đổi hotkey, macro, công thức thống kê, layout
report. §10 liệt kê từng thứ.

---

## 0. Tóm tắt một trang

| | Hôm nay | Sau khi sửa |
|---|---|---|
| `UPDATE public.matches` từ app tagging | **42501 permission denied** cho mọi cột trừ 6 cột của site khách | 5 cột app tagging cần được ghi lại |
| Ai được `UPDATE` một hàng | staff, hoặc admin của channel chứa trận | + **người đã tạo trận đó** (`created_by = auth.uid()`) |
| Submit đội hình | báo ⚠ đỏ, dữ liệu chỉ nằm ở localStorage | lưu thật lên `matches.lineups` |
| Đặt Duration | **im lặng** hỏng — chỉ `console.warn` | lưu thật lên `matches.config`; hỏng thì có toast |
| Đổi tên đội / đặt video URL | im lặng hỏng | lưu thật; hỏng thì có toast |
| Reload khi cloud có bản `lineups` **rỗng** | bản rỗng đè bản tốt ở máy → **mất sạch** | bản rỗng bị bỏ qua, bản ở máy được nhận và đẩy lên |
| Trang Stats / report trên máy khác | rỗng đội hình, sai đồng hồ | đúng như app tagging |
| Migration | — | **0025** |

> **Đây không phải bug của một tính năng, đây là bug của tầng lưu trữ.** Bug 1 và Bug 2 mà
> báo cáo nêu là hai triệu chứng của **cùng một** nguyên nhân, và còn ít nhất 3 triệu chứng
> nữa chưa ai báo (§5.1–§5.3).

---

## 1. Bằng chứng — đo được, không suy đoán

### 1.1 Database từ chối ghi, đúng theo cột

Đăng nhập bằng đúng anon key site đang dùng, `PATCH` vào một `id` **không tồn tại** (không
hàng nào khớp, không dữ liệu nào đổi được):

| Cột thử ghi | Kết quả |
|---|---|
| `lineups` | `42501 permission denied for table matches` |
| `config` | `42501 permission denied for table matches` |
| `home_name` | `42501 permission denied for table matches` |
| `video_url` | `42501 permission denied for table matches` |
| `kickoff` | **HTTP 204** — được phép |

`kickoff` là một trong 6 cột `0023`/`0024` cấp cho site khách. 4 cột kia là 4 cột app
tagging cần. Ranh giới trùng khít.

### 1.2 Hàng trận nói cùng một chuyện

`select code, created_at, config, lineups, video_url from public.matches order by created_at desc`:

| code | tạo ngày | `config` | `lineups` | `video_url` |
|---|---|---|---|---|
| 37138 | 2026-09-10 | `{}` | **null** | – |
| 91333 | 2026-09-02 | `{}` | `h:xi0/sub0 a:xi0/sub0` (**rỗng**) | – |
| 44685 | 2026-08-04 | `{"h1End":…}` | `h:xi11/sub4 a:xi11/sub6` | yes |
| 45956 | 2026-07-29 | `{"h1End":…}` | `h:xi11/sub4 a:xi11/sub3` | yes |
| 55357 | 2026-07-26 | `{"h1End":…}` | `h:xi11/sub4 a:xi11/sub5` | yes |
| 51977 | 2026-07-24 | `{"h1End":…}` | `h:xi11/sub5 a:xi11/sub11` | yes |
| 32746 | 2026-07-20 | `{"h1End":…}` | `h:xi11/sub5 a:xi11/sub5` | yes |
| 74244 | 2026-07-14 | `{"h1End":…}` | `h:xi11/sub0 a:xi11/sub1` | yes |
| 24782 | 2026-07-06 | `{"h1End":…}` | `h:xi11/sub0 a:xi11/sub0` | yes |

Mọi trận tạo **trước** tháng 9 có đủ `config` + `lineups` + `video_url`. Hai trận tạo **từ
2026-09-02 trở đi** không có gì. Ngày đó là ngày `0023` được chạy trên production.

### 1.3 localStorage của trình duyệt đang dùng

Đọc thẳng leveldb của Chrome, origin `https://hoangnams.com`, thời điểm 2026-09-10:

```
pitchtagger.meta.v1              matchId 744ffee4…  (code 37138, Hanley Town vs Congleton Vale)
pitchtagger.lineups.match.v1     744ffee4…                       ← có dấu, đúng trận đang mở
pitchtagger.lineups.v1           home roster=15 xi=11 subs=[15,17,12,6] · away rỗng
pitchtagger.lineups.draft.v1     giống hệt bản trên
pitchtagger.duration.v1          {"enabled":true,"h1Start":517.25,"h1End":3341.96,
                                  "h2Start":4249.34,"h2End":7319.97}
pitchtagger.rows.v1              []
```

Hai điều đọc ra từ đây:

1. **localStorage không đầy, và ghi vẫn tới nơi.** Đội hình 1727 byte nằm đó, có dấu đúng
   trận. Vậy dữ liệu mất **không phải** vì quota.
2. **`pitchtagger.duration.v1` là của trận TRƯỚC** (32746 — Saint Lucia vs Barbados), không
   phải của 37138. Sequence number của nó nhỏ hơn sequence của `lineups.match.v1`, tức nó
   được ghi **trước khi** 37138 được mở. Đây là một bug riêng — §5.4 D5.

### 1.4 Hai hàng rào, không phải một

- `is_staff()` gọi bằng session anonymous → **`false`**.
- Chỉ **5** trận trong database có `club_id`; trận 37138 có `club_id = null`.

Nghĩa là kể cả sau khi trả lại quyền cột, policy `matches_update` vẫn sẽ chặn — và chặn
**không báo lỗi** (§2.2). Đây là chỗ §15 của `docs/match-edit-design.md` chưa nói tới.

---

## 2. Nguyên nhân gốc

### 2.1 Hàng rào 1 — quyền cấp CỘT (`0023` + `0024`)

`supabase/migrations/0023_match_round_and_edit.sql`, phần 3:

```sql
revoke update on public.matches from authenticated;
grant  update (kickoff, match_date, league, season, round)
  on public.matches to authenticated;
```

`0024` thêm cột thứ sáu:

```sql
grant update (venue) on public.matches to authenticated;
```

Từ đó, vai trò `authenticated` chỉ còn `UPDATE` được **6 cột**. App tagging **cũng chạy dưới
vai trò đó** (`auth.js` bắt đăng nhập, `cloud-sync.js` dùng chính session đó). Mọi câu
`update` của nó nhắm vào cột khác → Postgres trả `42501`.

Chính file `0023` đã cảnh báo đúng chuyện này:

> **CẢNH BÁO**: revoke này áp cho vai trò `authenticated`, và APP TAGGING CŨNG CHẠY DƯỚI VAI
> TRÒ ĐÓ. Nếu sau khi tạo trận nó còn UPDATE cột nào khác của `public.matches` — `config`
> khi đặt Duration, `home_score`, `home_team_id`, `lineups`… — cột đó phải được thêm vào
> grant bên dưới, nếu không thao tác ấy sẽ báo `permission denied for table matches`.

Bước kiểm số 3 ở đầu `0023` ("MỞ APP TAGGING, TẠO MỘT TRẬN VÀ LƯU") đã không được làm sau
khi chạy migration. Đó là toàn bộ câu chuyện.

### 2.2 Hàng rào 2 — policy `matches_update` (cũng của `0023`)

```sql
create policy matches_update on public.matches for update to authenticated
  using      (public.is_staff() or (club_id is not null and public.is_club_admin(club_id)))
  with check (public.is_staff() or (club_id is not null and public.is_club_admin(club_id)));
```

Trận app tagging vừa tạo có `club_id = null` (nó chỉ được gán khi Submit Analysis publish
vào channel). Nếu người tagging **không** nằm trong `public.staff` thì cả hai vế đều false →
hàng bị lọc khỏi câu UPDATE → **0 hàng đổi, và PostgREST trả 204 KHÔNG lỗi**.

> **Đây là lý do phải sửa cả hai hàng rào trong cùng một lần.** Chỉ trả lại quyền cột thôi
> thì lỗi đỏ hôm nay biến mất, thao tác trông như thành công, và dữ liệu vẫn không được lưu.
> **Im lặng còn tệ hơn báo lỗi.**

---

## 3. Bug 1 — đội hình và substitutes (đã báo)

### 3.1 Chuỗi sự việc

1. Player lists → sắp đội hình → **⇪ Submit home**.
2. `publishTeam()` (`Player-Lists/index.html:190`) gọi `saveLineupsLS(P,id)` → ghi
   `localStorage` **thành công**, rồi `pushPublished()` → `update({lineups:P})` →
   **42501**. Header hiện `⚠ cloud save failed: permission denied for table matches`.
3. Tab tagging đang mở nghe `storage` event trên `pitchtagger.lineups.v1`, nhận bản mới →
   **vẫn vẽ đủ formation và substitutes**. Đúng như báo cáo.
4. **Reload.** Cái mất hay không mất phụ thuộc `matches.lineups` đang giữ gì:

| `matches.lineups` trên cloud | `cloud-sync.js:343` làm gì | Kết quả |
|---|---|---|
| `null` (trận 37138) | `resetLineups(row.id)` → thấy bản ở máy có dấu đúng trận và không rỗng → **nhận** | dữ liệu còn |
| **rỗng nhưng có hình dạng** (trận 91333) | `applyCloudLineups(row.lineups, row.id)` → ghi đè | **MẤT SẠCH, ở cả hai trang** |

### 3.2 Đã dựng lại được

Chạy đúng các hàm thật lấy ra từ `index.html` và `shared.js` (không viết lại một dòng nào):

```
=== step 1: Player-Lists "Submit home" ===
  local published copy: xi=2 subs=[12,15,17] roster=2

=== step 2: reload the TAGGER — matches.lineups = null (never saved) ===
  -> resetLineups() ADOPTED the local copy
  RESULT on the tagger after reload:       xi=2 subs=[12,15,17] roster=2
  RESULT on Player-Lists after reload:     xi=2 subs=[12,15,17] roster=2

=== step 2: reload the TAGGER — matches.lineups = a STALE older copy ===
  -> applyCloudLineups() ran
  RESULT on the tagger after reload:       xi=0 subs=[] roster=1     ← MẤT
  RESULT on Player-Lists after reload:     xi=0 subs=[] roster=1     ← MẤT
```

`Player-Lists/index.html:267` có đúng lỗi ấy ở dạng thứ hai:
`if(cloud&&cloud.home&&cloud.away){published=cloud;saveLineupsLS(published,id);}` — một bản
cloud **rỗng** vẫn thoả điều kiện đó và vẫn được ghi đè xuống máy.

### 3.3 Còn một đường mất dữ liệu VĨNH VIỄN nữa

`pitchtagger.lineups.v1` chỉ giữ **đúng một** trận. Mở trận khác là bản cũ bị thay. Bình
thường điều đó vô hại vì cloud mới là nguồn thật — nhưng cloud đang không nhận gì, nên
**chuyển trận là xoá vĩnh viễn đội hình của trận trước**.

Bằng chứng: bản `lineups.v1` cũ (seq nhỏ hơn) từng có `home roster=16 xi=11 subs=5` +
`away roster=16 xi=11 subs=5` + **9 bản ghi `history`** (các lần thay người / thẻ đỏ) —
10621 byte công sức. Nó đã bị thay bởi bản 1727 byte của trận 37138, và hàng cloud của trận
cũ thì `lineups: null`. **Không lấy lại được.**

---

## 4. Bug 2 — Duration (đã báo)

1. Duration → điền `mm:ss` → `applyDur()` (`index.html:4202`) gọi `saveDuration()` → ghi
   `localStorage` thành công, rồi `Cloud.onDurationChanged(d)`.
2. `cloud-sync.js:448` → `update({config:d})` → **42501** → `console.warn('duration save:',…)`
   và **hết**. Người dùng không thấy gì.
3. `matches.config` mãi là `{}`.

Vì sao reload lại rỗng: `matches.config` khai báo `not null default '{}'::jsonb`, nên
`row.config` **luôn truthy** và `openMatchRow` luôn gọi `applyCloudDuration({})`. Hàm đó có
chốt `if(!cfg||!Object.keys(cfg).length)return;` nên nó không xoá gì — nhưng nó cũng không
**nạp** gì. Đồng hồ của trận sống hay chết hoàn toàn phụ thuộc `localStorage`, mà
`localStorage` thì:

- không có dấu trận (§5.4 D5) — nó là **một** giá trị dùng chung cho mọi trận;
- mở trận khác → giá trị cũ ở nguyên đó và được áp cho trận mới;
- xoá site data / đổi máy / đổi trình duyệt → mất.

Đúng như §1.3 đo được: `duration.v1` đang giữ đồng hồ của trận **32746** trong khi trận đang
mở là **37138**.

---

## 5. Rà soát toàn site — những chỗ hỏng khác

### 5.1 `matches.home_name` / `away_name` — hỏng, chưa ai báo

`cloud-sync.js:439` `onTeamNamesChanged()`. Sửa tên đội trong app tagging **không** tới
database từ đầu tháng 9. Máy khác, trang Stats, report và site khách vẫn đọc tên cũ. Lỗi chỉ
vào `console.warn('match name update:', …)`.

### 5.2 `matches.video_url` — hỏng, chưa ai báo

`cloud-sync.js:400` `setVideoUrl()`. Dán URL video dùng chung, **hoặc upload lên R2 xong**,
thì `update({video_url})` bị từ chối → hàm trả `false` → app chỉ phát video đó cục bộ. Bảng
§1.2 xác nhận: mọi trận từ 2026-09-02 đều `video_url = null`, mọi trận trước đó đều có.

> Đây là chỗ tốn tiền nhất: file đã được upload thật lên R2 rồi mới mất đường lưu địa chỉ.

### 5.3 Trang Stats và Match Report — rỗng trên MỌI máy khác

`Stats/stats-view.js:2486` mở bằng `#match=` thì bật `cloudMode=true` và đọc **`lineups` /
`config` / `video_url` từ hàng trận**, không đọc localStorage của tab tagging:

```js
if(row.config&&Object.keys(row.config).length) dur=Object.assign({…},row.config);
if(row.lineups&&row.lineups.home&&row.lineups.away) lineups=row.lineups;
videoSrc=row.video_url?{url:row.video_url}:null;
```

Cả ba đều rỗng cho mọi trận từ tháng 9. Hệ quả, cho mọi người **không** ngồi đúng chiếc máy
đã tag:

- không formation, không danh sách dự bị;
- **minutes played sai** (nó tính từ `lineups.subHistory`);
- đồng hồ trận không được map — mọi mốc thời gian là thời gian video thô;
- không xem được video trong report.

Trên **chính** máy đã tag thì `loadLocal()` vẫn đọc localStorage nên trông vẫn đúng. Đó là
lý do chuyện này chưa bị phát hiện.

### 5.4 Lỗi phía client — vẫn phải sửa dù database đã thông

| # | Chỗ | Vấn đề |
|---|---|---|
| **D1** | `shared.js:42`, `index.html:978` | `saveLineupsLS()`/`writeLineupsLS()` bọc `setItem` trong `try{}catch(e){}` rồi **`return true` bất kể**. localStorage ném lỗi (quota, private mode) → hàm vẫn báo thành công → `publishTeam()` vẫn nói "đã gửi sang tab tagging". Tệ hơn: dấu (`lineupsMatch`) được ghi **trước**, nên nếu câu thứ hai ném lỗi thì dấu đã trỏ sang trận mới trong khi nội dung vẫn là của trận cũ — `lineupsAreFor()` từ đó nói dối. |
| **D2** | `cloud-sync.js:401,440,449,469,492,497` | Mọi hỏng hóc khi ghi cloud chỉ vào `console.warn`. Đây là lý do Bug 2 im lặng suốt một tuần. Trang Player lists có `setSaveStatus()` nên nó là chỗ **duy nhất** nói ra sự thật. |
| **D3** | `cloud-sync.js:343`, `Player-Lists/index.html:267` | Một bản `lineups` **rỗng nhưng đúng hình dạng** trên cloud đè bản tốt hơn ở máy. Đã dựng lại ở §3.2. |
| **D4** | `index.html:1115` `applyCloudLineups()` | Chỉ kiểm hình dạng (`l.home && l.away`), không kiểm rỗng — trong khi `applyCloudDuration()` ngay bên cạnh **có** kiểm rỗng. Hai hàm song song, hai luật khác nhau. |
| **D5** | `index.html:1018` `DUR_STORE` | Duration **không có dấu trận**, khác hẳn lineups. Mở trận B sau trận A thì B thừa hưởng đồng hồ của A và **map sai toàn bộ mốc thời gian** một cách âm thầm. Đo được ở §1.3. Trang Stats đọc cùng khoá đó (`stats-view.js:2571`) nên nó cũng sai theo. |
| **D6** | `index.html:4495` | Mở app tagging **không có** `#match=` thì `saveMeta()` ghi `matchId:null` xuống `pitchtagger.meta.v1`. Player lists và Stats đọc `meta.matchId`, nên cả hai lập tức báo "No match is open" và vẽ rỗng — nhìn y hệt "mất hết dữ liệu", dù store vẫn còn nguyên. |

### 5.5 Những chỗ **không** hỏng — đã kiểm, không cần đụng

Thử `UPDATE` vào `id` không tồn tại trên từng bảng (không hàng nào khớp):

| Bảng | Kết quả |
|---|---|
| `events` | HTTP 204 — quyền còn nguyên |
| `teams` | HTTP 204 |
| `players` | HTTP 204 |
| `event_types` | HTTP 204 |
| `user_prefs` | HTTP 204 |
| `match_reports` | HTTP 204 |
| `clubs` | HTTP 204 |

**`public.matches` là bảng DUY NHẤT bị hỏng.** `0023` chỉ revoke đúng bảng đó.

Ngoài ra đã kiểm và **không** có vấn đề:

- `matches` **INSERT** vẫn chạy — `0023` không đụng quyền insert, và trận 37138 tạo hôm nay
  là bằng chứng.
- `publish_match_report()` (`0016`) là `security definer` nên nó `update public.matches` với
  quyền của owner, **vượt qua cả grant lẫn RLS**. Submit Analysis không bị ảnh hưởng.
- `client/assets/supa.js:540` (form Edit của site khách) chỉ gửi đúng 6 cột được cấp, và
  `tests/match-edit.test.js` đang canh cho danh sách ấy không lệch. Đúng, không sửa.
- Trang Stats **không ghi** `localStorage` lần nào — nó chỉ đọc. Không có bug lưu trữ ở đó.

---

## 6. Phương án sửa

Hai lớp, độc lập nhau. Lớp database khiến dữ liệu **tới được** cloud. Lớp client khiến việc
hỏng **không im lặng** và khiến bản rỗng trên cloud **không đè** bản tốt ở máy. Cần cả hai:
lớp database sửa nguyên nhân, lớp client sửa cách hệ thống chịu đựng khi nguyên nhân ấy —
hoặc một nguyên nhân tương tự — quay lại.

### 6.1 Lớp database — migration `0025`

#### 6.1.1 Phương án A (ĐỀ XUẤT) — cấp đúng 5 cột, và mở policy cho người tạo trận

```sql
-- supabase/migrations/0025_match_tagging_columns.sql

-- ------------------------------------------------------------
--  1. năm cột app tagging ghi sau khi trận đã được tạo
-- ------------------------------------------------------------
-- 0023 revoke UPDATE cả bảng rồi cấp lại 5 cột cho form Edit của site khách; 0024
-- thêm cột thứ 6. App tagging chạy dưới CÙNG vai trò `authenticated`, nên từ lúc
-- 0023 chạy, mọi câu update của nó báo 42501. Đây là danh sách đủ và tối thiểu,
-- đọc thẳng ra từ code — không có cột thứ sáu nào:
--
--   lineups     cloud-sync.js onLineupsChanged() + Player-Lists publishTeam()
--   config      cloud-sync.js onDurationChanged()
--   home_name   cloud-sync.js onTeamNamesChanged()
--   away_name   cloud-sync.js onTeamNamesChanged()
--   video_url   cloud-sync.js setVideoUrl()
--
-- grant là CỘNG DỒN: câu này không lấy đi cột nào của 0023/0024.
-- KHÔNG cấp: home_score, away_score, published, club_id, our_side, code,
-- home_team_id, away_team_id, sport — app tagging chỉ đặt chúng lúc INSERT.
grant update (lineups, config, home_name, away_name, video_url)
  on public.matches to authenticated;

-- ------------------------------------------------------------
--  2. ai được sửa: thêm chính người đã tạo trận
-- ------------------------------------------------------------
-- Quyền cột ở trên chưa đủ. matches_update của 0023 đòi staff hoặc admin của
-- channel chứa trận. Một trận app tagging vừa tạo có club_id = null (club_id chỉ
-- được gán khi Submit Analysis publish nó vào channel), nên với người tagging
-- không phải staff, câu update khớp 0 HÀNG và PostgREST trả 204 KHÔNG lỗi.
-- Sửa mỗi phần 1 sẽ làm lỗi đỏ biến mất và dữ liệu vẫn không được lưu — im lặng.
--
-- `created_by` có sẵn từ 0001 (`default auth.uid()`), tức đúng người đã bấm tạo
-- trận. Đây KHÔNG mở lại lỗ hổng 0023 đã đóng: lỗ hổng đó là `using (true)` —
-- mọi tài khoản sửa mọi hàng. Vế này chỉ nói "trận của chính anh".
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update to authenticated
  using      (public.is_staff()
              or created_by = auth.uid()
              or (club_id is not null and public.is_club_admin(club_id)))
  with check (public.is_staff()
              or created_by = auth.uid()
              or (club_id is not null and public.is_club_admin(club_id)));
```

**Vì sao đây là phương án đề xuất**

- **Chỉ SQL.** Không đụng một dòng client nào, nên không tab nào, không tính năng nào có
  thể vỡ theo. Đúng ràng buộc "không gây bug ở tab khác".
- Trả lại đúng hành vi trước tháng 9, không hơn.
- Giữ nguyên `0023`/`0024` và cả ý định bảo mật của chúng.
- Chạy được ngay, độc lập với lớp client.

**Cái nó nới ra, nói thẳng**

Admin của một channel, ngoài 6 cột của form Edit, nay còn `UPDATE` được 5 cột này **trên
đúng những trận đã publish vào channel của họ** — nhưng chỉ bằng cách gọi API trực tiếp; form
Edit chỉ gửi 6 cột và `tests/match-edit.test.js` canh điều đó. Rủi ro thực tế: một admin tự
đổi đội hình / đồng hồ trận của chính câu lạc bộ mình. Nếu **không** chấp nhận được thì dùng
Phương án B.

#### 6.1.2 Phương án B (thay thế) — hàm `security definer`

Không cấp cột nào thêm. Thay vào đó một hàm, đúng khuôn `publish_match_report()` của `0016`:

```sql
create or replace function public.save_match_tagging(
  p_match_id  uuid,
  p_lineups   jsonb default null,
  p_config    jsonb default null,
  p_home_name text  default null,
  p_away_name text  default null,
  p_video_url text  default null,
  p_touch     text[] default null      -- tên cột nào thực sự được ghi lần này
) returns void
language plpgsql security definer set search_path = public as $$ … $$;

grant execute on function public.save_match_tagging(…) to authenticated;
```

Bên trong kiểm `is_staff() or created_by = auth.uid()`, rồi chỉ `update` các cột có tên
trong `p_touch`.

| | Phương án A | Phương án B |
|---|---|---|
| File client phải sửa | **0** | `cloud-sync.js` (4 chỗ) + `Player-Lists/index.html` (1 chỗ) |
| Bump `?v=` | không | có — và mọi trang nạp file đó |
| Admin channel ghi được `lineups` | có (chỉ qua API) | **không** |
| Rủi ro vỡ tab khác | không có | có, tuy nhỏ |
| Độ phức tạp | 2 câu SQL | ~40 dòng PL/pgSQL + 5 chỗ gọi |

Đề xuất **A**. B để dành nếu sau này muốn siết.

#### 6.1.3 PHẢI kiểm trước khi chạy: người tagging có trong `public.staff` không

Chạy bằng **chính tài khoản đang tag** (SQL Editor của Supabase, hoặc từ console của app):

```sql
select public.is_staff() as am_i_staff, auth.uid() as me;
```

- Trả `true` → phần 2 của `0025` là **thừa** đối với riêng máy này, nhưng vẫn nên chạy: nó
  là cái làm cho một analyst **không** phải staff vẫn tag được trận mình tạo.
- Trả `false` → phần 2 là **bắt buộc**, không có nó thì phần 1 chỉ đổi "lỗi đỏ" thành "im
  lặng không lưu".

`0013` viết sẵn ý định này: *"Anyone in here keeps the unrestricted access the tagging app
relies on. PUT YOURSELF IN HERE BEFORE RUNNING PART B."* Nếu muốn đường ngắn nhất thì thêm
tài khoản analyst vào `public.staff` — nhưng đó là quyền **toàn bộ database**, còn
`created_by = auth.uid()` chỉ là quyền trên trận của chính mình. Nên làm cả hai đều được;
`0025` phần 2 là cái an toàn hơn và không cần nhớ thêm ai vào bảng nào.

#### 6.1.4 Vì sao `0025` là file mới, không sửa `0023`

Ba lý do, cả ba đều đã có tiền lệ trong repo:

1. `0023` chứa `create policy`. Chạy lại lần hai sẽ lỗi vì policy đã tồn tại — chính header
   của `0024` nói ra điều đó và đó là lý do `0024` tồn tại.
2. `tests/match-edit.test.js:307` khẳng định `0023 + 0024` cấp **đúng sáu** cột và
   `client/assets/supa.js` gửi đúng sáu cột ấy. Thêm cột vào `0023` sẽ **phá test đó**, và
   phá luôn điều nó muốn nói: *sáu cột là những gì một channel được ghi*.
3. Hai câu chuyện khác nhau nên nằm ở hai file khác nhau: `0023` nói "site khách sửa được
   gì", `0025` nói "app tagging lưu được gì".

`0025` **không** làm test hiện có đỏ: test kia chỉ đọc `0023` và `0024`. §8 thêm test mới
cho `0025`.

### 6.2 Lớp client

#### C1 — hỏng thì phải nói ra (`cloud-sync.js`)

Thêm một chỗ duy nhất, rồi bốn chỗ ghi gọi vào đó:

```js
/* Một câu ghi lên hàng trận không tới nơi là một sự thật người đang tag phải biết NGAY:
   từ lúc ấy trở đi bản duy nhất còn tồn tại nằm trong localStorage của đúng chiếc máy
   này, và mở trận trên máy khác sẽ không thấy gì. console.warn() đã giấu đúng chuyện đó
   suốt một tuần (xem docs/match-save-permission-design.md §4). */
function saveFailed(what, error) {
  console.warn(what + ' save:', error.message);
  status('⚠ ' + what + ' not saved to the cloud: ' + error.message, false);
  if (PT().toast) PT().toast('⚠ ' + what + ' is saved on this computer only — ' + error.message);
}
```

- `setVideoUrl` → `saveFailed('video', error)`
- `onTeamNamesChanged` → `saveFailed('team names', error)`
- `onDurationChanged` → `saveFailed('duration', error)`
- `onLineupsChanged` → `saveFailed('lineups', error)`

Không đổi luồng nào, không chặn gì — chỉ thêm một đường báo. `toast()` và `status()` đều đã
có sẵn và đang được dùng ở nơi khác.

#### C2 — một bản cloud RỖNG không được đè bản tốt ở máy

**`cloud-sync.js`, trong `openMatchRow()`** — sửa đúng một dòng:

```js
// TRƯỚC
if (row.lineups) PT().applyCloudLineups(row.lineups, row.id);
else if (PT().resetLineups) PT().resetLineups(row.id);

// SAU
/* Một hàng trận có thể giữ một object lineups RỖNG chứ không chỉ là null — đó là thứ
   một trận nhận được khi đội hình được nhập trong lúc matches.lineups không ghi được.
   Ở đây hai trường hợp đó nói cùng một điều: cloud không có gì để nói. Nên để
   resetLineups() quyết định, và nó đã biết cách nhận bản có dấu đúng trận trong máy
   này khi có. */
if (row.lineups && !PT().lineupsEmpty(row.lineups)) PT().applyCloudLineups(row.lineups, row.id);
else if (PT().resetLineups) PT().resetLineups(row.id);
```

`lineupsEmpty` đã tồn tại ở `index.html:972`; chỉ cần thêm tên nó vào `window.PT` ở dòng
4689. Không viết logic mới.

> **Cố ý chỉ sửa `openMatchRow`, KHÔNG sửa handler realtime trong `subscribe()`.** Lúc mở
> trận, một bản rỗng là dấu hiệu của hỏng hóc. Nhưng một `UPDATE` realtime mang bản rỗng là
> **tin thật**: ai đó vừa xoá đội hình ở máy khác, ngay lúc này. Hai ngữ cảnh khác nhau,
> hai luật khác nhau — và giữ nguyên handler realtime là cách "xoá đội hình" vẫn còn là một
> thao tác chạy được.

**`Player-Lists/index.html`, trong `loadMatchLineups()`** — cùng một luật:

```js
// TRƯỚC
const cloud=data&&data.lineups;
// SAU  (lineupsEmpty đã có sẵn trong shared.js)
const raw=data&&data.lineups;
const cloud=(raw&&!lineupsEmpty(raw))?raw:null;
```

Nhánh `if(!(cloud&&cloud.home&&cloud.away)&&hadLocal)pushPublished(published,id,null)` ngay
dưới đó khi ấy **tự chạy** — tức bản tốt ở máy được đẩy ngược lên cloud, tự chữa hàng trận
đã bị làm rỗng (trận 91333). Không phải viết thêm gì.

#### C3 — `saveLineupsLS()` / `writeLineupsLS()` không được nói dối

`shared.js:42` và `index.html:978` (hai bản của cùng một hàm, giữ chúng giống nhau):

```js
function saveLineupsLS(l,matchId){
  const id=String(matchId||'');
  if(!id&&!lineupsEmpty(loadLineups()))return false;
  /* Dấu được ghi TRƯỚC nội dung, có chủ đích (một tab bị đánh thức bởi event luôn đọc
     được dấu đi kèm bản nó vừa nhận). Nhưng nếu câu thứ hai ném lỗi thì dấu đã trỏ sang
     trận mới trong khi nội dung vẫn là của trận cũ, và lineupsAreFor() từ đó nói dối.
     Nên: trả dấu về chỗ cũ, và trả false để người gọi biết KHÔNG có gì được lưu. */
  const prev=localStorage.getItem(PT_KEYS.lineupsMatch);
  try{
    localStorage.setItem(PT_KEYS.lineupsMatch,id);
    localStorage.setItem(PT_KEYS.lineups,JSON.stringify(l));
  }catch(e){
    try{if(prev==null)localStorage.removeItem(PT_KEYS.lineupsMatch);
        else localStorage.setItem(PT_KEYS.lineupsMatch,prev);}catch(_){}
    return false;
  }
  return true;
}
```

`publishTeam()` đã có sẵn `if(!saveLineupsLS(P,id)){setSaveStatus('⚠ could not save the
squad',true);return;}` — nhánh đó hôm nay **không bao giờ chạy**. Sau thay đổi này nó chạy
đúng lúc cần.

#### C4 — Duration nên có dấu trận (D5) — **CẦN DUYỆT RIÊNG, chưa làm**

Đây là một bug thật (§1.3 đo được: trận 37138 đang dùng đồng hồ của trận 32746) nhưng **nằm
ngoài** hai bug được báo, và sửa nó là một thay đổi hành vi. Hình dạng nếu được duyệt:

- thêm `pitchtagger.duration.match.v1`, viết y hệt cặp `lineups` / `lineupsMatch`;
- `loadDuration()` chỉ tin store khi dấu khớp trận đang mở, không thì trả mặc định;
- `saveDuration()` đóng dấu;
- `Stats/stats-view.js:2571` `loadLocal()` đọc theo cùng luật.

**Không đưa vào lần sửa này.** Sau `0025`, `matches.config` trở thành nguồn thật và triệu
chứng nhẹ đi rất nhiều; phần còn lại xử lý riêng khi có yêu cầu.

#### C5 — `meta.matchId = null` khi mở app không có `#match=` (D6) — **chỉ ghi nhận**

`index.html:4495` đang làm đúng điều comment của nó nói, và đó có thể là ý định. Nó khiến
Player lists / Stats hiện "No match is open" — trông giống mất dữ liệu nhưng store vẫn còn
nguyên và mở lại trận là thấy lại. **Không sửa lần này.**

---

## 7. Các bước thực hiện, theo thứ tự

| # | Việc | Ở đâu | Kiểm ngay sau đó |
|---|---|---|---|
| 1 | Chạy `select public.is_staff(), auth.uid();` **bằng tài khoản đang tag** | Supabase SQL Editor | ghi lại kết quả — nó quyết định §6.1.3 |
| 2 | **Sao lưu** `lineups` + `config` của mọi trận | `select id,code,lineups,config from public.matches` → lưu file | có file JSON trong tay trước khi đụng quyền |
| 3 | Viết `supabase/migrations/0025_match_tagging_columns.sql` (§6.1.1) | repo | `node tests/run.js` vẫn **1523/1523** (chưa có test mới) |
| 4 | **Chạy `0025`** trên production | Supabase SQL Editor | §9.1 — ba câu kiểm |
| 5 | Sửa client C1 + C2 + C3 (§6.2) | `cloud-sync.js`, `Player-Lists/index.html`, `shared.js`, `index.html` | `node tests/run.js` |
| 6 | Bump `?v=` cho mọi file đã đổi, cập nhật `tests/asset-versions.json` | `index.html` (`cloud-sync.js?v=52`), `Player-Lists/index.html` + `Stats/index.html` (`shared.js?v=28`) | `asset-versions.test.js` xanh |
| 7 | Thêm 4 test mới (§8) | `tests/` | `node tests/run.js` → **1527/1527** |
| 8 | Deploy | `git push` → `deploy.yml` | §9.2 — kiểm bằng tay trên site thật |
| 9 | **Chữa lại dữ liệu đã hỏng** | §9.3 | trận 91333 và 37138 có `lineups`/`config` thật |

> **Bước 4 phải chạy TRƯỚC bước 8.** Nếu client lên trước thì C1 sẽ bắt đầu hiện toast báo
> lỗi cho một lỗi vẫn đang tồn tại — đúng, nhưng ồn ào vô ích.

> Bước 6 không được quên: theo `deploy.yml`, mọi file trên đều đã có trong danh sách `cp`
> nên không 404 — nhưng người đã dùng site sẽ nhận **JS cũ trong cache** nếu `?v=` không đổi.
> `tests/asset-versions.test.js` bắt lỗi này, nên cứ chạy test là biết.

---

## 8. Test

Bốn test mới, đúng khuôn các test đang có (đọc **source thật**, không viết lại logic):

| Test | Ở đâu | Khẳng định |
|---|---|---|
| `0025 cấp đúng năm cột app tagging cần, không cột thứ sáu` | `tests/match-edit.test.js` (nối vào cụm `0023`/`0024`) | đọc `0025`, so danh sách grant với đúng 5 tên; và khẳng định `home_score`, `away_score`, `published`, `club_id`, `code` **không** có trong đó |
| `0025 không lấy đi cột nào của site khách` | như trên | `0025` **không** chứa `revoke` — nếu có, nó sẽ thu hồi 6 cột của `0023`/`0024`, đúng cái bẫy `0024` đã cảnh báo |
| `matches_update nới cho người tạo trận, và không nới thêm gì` | như trên | `using` và `with check` giống hệt nhau, và cả hai đúng bằng ba vế `is_staff() / created_by = auth.uid() / club_id is not null and is_club_admin(club_id)` — **không** có `using (true)` |
| `một bản lineups rỗng trên cloud không đè bản ở máy` | `tests/submit-lineup.test.js` | lift `openMatchRow` từ `cloud-sync.js` + `resetLineups`/`lineupsEmpty` từ `index.html`, chạy đúng kịch bản §3.2 và khẳng định `xi` vẫn là 11 |

Test thứ tư là test **quan trọng nhất**: nó khoá lại đúng đường mất dữ liệu đã dựng lại được,
và nó sẽ đỏ nếu ai đó bỏ chốt `lineupsEmpty` trong `openMatchRow`.

Ngoài ra `tests/match-edit.test.js:307` (`a channel may write six columns and no others`)
**phải vẫn xanh, không sửa** — nó chỉ đọc `0023`/`0024`, và ý nó vẫn đúng: sáu cột vẫn là
những gì *form Edit của channel* ghi.

---

## 9. Kiểm bằng tay

### 9.1 Ngay sau khi chạy `0025` (chưa deploy client)

1. `select round from public.matches limit 1;` → có, không lỗi *(bước kiểm cũ của `0023`,
   để chắc `0025` không lỡ tay revoke gì)*.
2. Đăng nhập bằng một tài khoản **viewer**, thử `update` một trận **của club khác** → vẫn
   phải **bị từ chối**. Đây là lỗ hổng `0023` đã đóng; `0025` không được mở lại.
3. Mở app tagging (bản cũ đang chạy cũng được), vào một trận **mình tạo**, đặt Duration →
   `console` **không còn** `duration save: permission denied`.
4. `select config from public.matches where code='37138';` → **không còn là `{}`**.

### 9.2 Sau khi deploy client

| Việc | Phải thấy |
|---|---|
| Player lists → ⇪ Submit home | `⇪ Hanley Town FC sent to the tagging tab`, **không** có ⚠ |
| Reload cả hai trang | formation + substitutes còn nguyên |
| Mở cùng `#match=` trên **máy khác / trình duyệt khác** | thấy đúng formation + substitutes + Duration |
| Đặt Duration, reload | các ô `mm:ss` còn nguyên |
| Đổi tên đội, reload | tên mới còn nguyên |
| Trang Stats với `#match=` trên máy khác | có formation, minutes played đúng, đồng hồ trận đúng |
| Ngắt mạng rồi Submit | có toast báo "saved on this computer only" — **không** im lặng |
| Mở trận A → mở trận B → quay lại A | đội hình của A vẫn là của A |

### 9.3 Chữa lại dữ liệu đã hỏng

Sau khi `0025` chạy, mỗi trận hỏng được chữa bằng chính app, không cần SQL vá tay:

- **37138** (`lineups: null`, `config: {}`) — bản tốt vẫn nằm trong localStorage của chiếc
  máy đã tag. Mở đúng máy đó, mở trận, vào Player lists → **⇪ Submit home** và
  **⇪ Submit away**; mở Duration → sửa một ô rồi sửa lại như cũ (để `applyDur()` chạy). Kiểm
  bằng §9.1 câu 4.
- **91333** (`lineups` rỗng) — sau C2, chỉ cần mở trận: `loadMatchLineups()` thấy cloud rỗng,
  giữ bản ở máy, và `pushPublished()` tự đẩy lên. Không phải bấm gì.
- **Đội hình của trận trước đã bị ghi đè** (bản 10621 byte, 16+16 cầu thủ, 9 `history`) —
  **không lấy lại được**. `pitchtagger.lineups.v1` chỉ giữ một trận, và nó đã bị thay bởi
  37138. Ghi lại ở đây để không ai đi tìm.

> **Làm §9.3 trước khi xoá site data, đổi trình duyệt, hay mở trận khác trên chiếc máy đó.**
> localStorage của nó đang là bản sao duy nhất còn tồn tại của đội hình 37138.

---

## 10. Không đụng tới — và vì sao

| Thứ | Vì sao không đụng |
|---|---|
| `0023`, `0024` | §6.1.4. Ý định bảo mật của chúng đúng và giữ nguyên; `0025` chỉ cộng thêm. |
| `client/assets/supa.js` / `app.js` / `app.css` | Form Edit của channel đã đúng — gửi đúng 6 cột được cấp. Bug này không chạm tới nó. |
| `Stats/stats-view.js`, `Stats/report.js` | Chúng chỉ **đọc**. Sửa nguồn thì chúng tự đúng. Không có bug lưu trữ nào ở đây. |
| `publish_match_report()` / Submit Analysis | `security definer` — chưa từng hỏng. |
| `events`, `teams`, `players`, `event_types`, `user_prefs`, `match_reports`, `clubs` | §5.5 đã đo: quyền còn nguyên. |
| `subscribe()` handler realtime trong `cloud-sync.js` | §6.2 C2 nói vì sao: ở đó bản rỗng là tin thật. |
| `DUR_STORE` chưa đóng dấu trận (D5) | §6.2 C4 — bug thật, nhưng là thay đổi hành vi, chờ duyệt. |
| `index.html:4495` (D6) | §6.2 C5 — đang làm đúng điều nó nói, chờ duyệt. |
| Hotkey, macro, event dictionary, công thức thống kê, layout report, minutes-played | Không liên quan. Không một dòng nào trong §6 chạm tới. |

---

## 11. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Chạy `0025` phần 1 mà quên phần 2, người tag không phải staff | **cao nếu bỏ sót** | §6.1.3 bắt kiểm trước; §9.1 câu 4 bắt được ngay sau khi chạy |
| Admin channel ghi được `lineups`/`config` của trận club mình qua API | thấp | Chấp nhận trong Phương án A; muốn chặn thì dùng Phương án B (§6.1.2) |
| C2 làm "xoá đội hình" từ máy khác không tới nơi | thấp | Chỉ sửa `openMatchRow`, giữ nguyên handler realtime — §6.2 C2 |
| Quên bump `?v=` → người dùng cũ nhận JS cũ | trung bình | `tests/asset-versions.test.js` bắt; bước 6 của §7 |
| `0025` chạy hai lần | không | `grant` cộng dồn, `drop policy if exists` + `create policy` — chạy lại an toàn |
| Sửa `saveLineupsLS` (C3) làm lộ ra một nhánh lỗi chưa từng chạy | thấp | Nhánh đó đã có sẵn trong `publishTeam()` và chỉ hiện một dòng chữ đỏ |

---

## 12. Rollback

- **Lớp database:** `revoke update (lineups, config, home_name, away_name, video_url) on
  public.matches from authenticated;` và dựng lại `matches_update` đúng như `0023`. Trở về
  đúng trạng thái hôm nay (tức là trở lại hỏng).
- **Lớp client:** `git revert` một commit. Không có store mới, không có khoá localStorage
  mới, không có định dạng dữ liệu nào đổi — nên hạ cấp không mất gì.
- Không có bước nào trong §7 **xoá** dữ liệu, nên rollback không kèm mất mát.

---

## 13. Câu hỏi cần duyệt trước khi làm

1. **Phương án A hay B** cho lớp database? (§6.1.1 / §6.1.2 — đề xuất **A**.)
2. **`created_by = auth.uid()`** trong `matches_update` — đồng ý không? Nếu không, đường còn
   lại là thêm tài khoản analyst vào `public.staff`, quyền rộng hơn nhiều.
3. **C4 (đóng dấu trận cho Duration)** — làm luôn trong lần này, hay tách ra? (Đề xuất:
   **tách**.)
4. **C5 (`meta.matchId = null`)** — giữ nguyên hành vi hôm nay? (Đề xuất: **giữ**.)

---

## 14. Đã triển khai (2026-09-10)

Trạng thái đổi thành: **CODE ĐÃ XONG, MIGRATION CHƯA CHẠY.** Phần thân trên là bản đã duyệt;
chỗ nào nó và §14 nói khác nhau thì **§14 là code đang chạy**.

Duyệt: Q1 = **A**, Q2 = **đồng ý** (`created_by = auth.uid()`), Q3 = **làm luôn** (C4),
Q4 = xem §14.4.

Test: `node tests/run.js` → **1541/1541 passed** (nền trước khi sửa: 1523).

### 14.1 Một nguyên nhân nữa, tìm thấy lúc code: Bug 2 có HAI nguyên nhân

Thiết kế nói Bug 2 do `42501`. Đúng, nhưng chưa đủ. Còn một lỗi thuần client, độc lập hoàn
toàn với database:

```js
const state = {              // dòng 988
  duration:loadDuration(),   // dòng 996  ← chạy ở ĐÂY
  ...
};
const DUR_STORE='pitchtagger.duration.v1';   // dòng 1018 ← khai báo ở ĐÂY
```

`loadDuration()` chạy trong lúc dựng object `state`, tức **trước** khi `const DUR_STORE`
được khởi tạo. Nó đọc phải temporal dead zone → `ReferenceError` → rơi thẳng vào
`try{}catch(e){}` của chính nó → hàm lặng lẽ trả về giá trị mặc định. **Mỗi lần boot.**

Nghĩa là app tagging **chưa bao giờ** đọc lại Duration từ `localStorage` lúc khởi động. Đo
được: giá trị vẫn nằm nguyên trong leveldb suốt cả tuần (§1.3) trong khi modal thì trống —
đúng ảnh chụp trong báo cáo. Kể cả có `0025`, chỉ riêng lỗi này cũng đủ làm mất Duration mỗi
lần reload khi không có mạng hoặc khi cloud chưa kịp trả lời.

Đây đúng là cái bẫy mà chính file đã cảnh báo ở `state.macros` ngay bên trên, và là lý do
`LU_STORE` từng được chuyển lên trên `state`. Khối duration nay cũng nằm trên `state`, và có
test giữ chỗ (§14.3).

### 14.2 Đã sửa những gì

| Việc | File | Ghi chú |
|---|---|---|
| `0025` — cấp 5 cột + `created_by = auth.uid()` | `supabase/migrations/0025_match_tagging_columns.sql` | **mới**; chưa chạy — §14.5 |
| C1 — `saveFailed()` + 4 điểm ghi | `cloud-sync.js` | `status()` + `toast()`, không còn `console.warn` trần |
| C2 — bản cloud rỗng không đè bản ở máy | `cloud-sync.js`, `Player-Lists/index.html` | handler realtime **giữ nguyên**, có comment nói vì sao |
| C3 — `writeLineupsLS`/`saveLineupsLS` trả `false` thật, và trả dấu về chỗ cũ | `index.html`, `shared.js` | nhánh `⚠ could not save the squad` trong `publishTeam()` từ nay chạy được |
| C4 — đóng dấu trận cho Duration | `index.html`, `shared.js`, `Stats/stats-view.js` | `pitchtagger.duration.match.v1`, `resetDuration()`, `ourDur()` |
| C4b — chuyển khối duration lên trên `state` | `index.html` | §14.1 — không có trong thiết kế gốc |
| C4c — `onDurationChanged(d, forMatchId)` | `cloud-sync.js`, `index.html` | đúng chốt mà `onLineupsChanged` đã có; write bị debounce 250ms nên không có nó thì đồng hồ trận A rơi vào trận B |
| `?v=` + manifest | 5 file | `cloud-sync.js` 51→52, `shared.js` 27→28, `stats-view.js` 28→29, `app.js` 58→59 |

**`client/assets/app.js` và `client/app.html` có đổi** — §10 nói không đụng, và nó **không**
đổi hành vi: chỉ hai chuỗi `?v=` (app.js nạp `shared.js` và `stats-view.js` lúc chạy nên phải
mang cùng số), rồi `?v=` của chính `app.js` phải nhích theo. Chính `tests/asset-versions.test.js`
bắt buộc điều này.

### 14.3 Test đã thêm — 18 test

`tests/match-save.test.js` (**mới**, 14 test) và 4 test nối vào `tests/match-edit.test.js`.

Hai test quan trọng nhất đã được **kiểm ngược bằng cách dựng lại lỗi**: bỏ chốt rỗng trong
`openMatchRow` → test A đỏ; chuyển khối duration về dưới `state` → test E đỏ. Chúng bắt được
đúng thứ chúng nói.

`tests/recent-matches.test.js` sửa **một** dòng: anchor nó dùng để cắt hàm `openMatchRow` là
`if (row.config)`, mà điều kiện đó nay dài thêm. Anchor đổi, mọi assertion giữ nguyên.

### 14.4 Q4 — `meta.matchId` KHÔNG bị sửa, và vì sao

Câu trả lời duyệt nói matchId không được null vì nếu null thì không tìm lại được trận trong
nút ⚽ Match. **Đã kiểm và điều đó không xảy ra:** danh sách trong ⚽ Match đọc
`pitchtagger.recent.v1`, khoá theo `PTAuth.user().id` (`index.html:4452`), **không** đọc
`meta.matchId` một lần nào. Xoá meta không làm mất trận khỏi danh sách đó; mở lại trận từ đó
là `saveMeta()` ghi lại đầy đủ.

Còn khối `index.html:4495` thì là **phòng tuyến có chủ đích và có test**
(`tests/no-match-tabs.test.js`): trước đây mở app không kèm `#match=` thì tab Stats vẽ nguyên
đội hình của trận trước cho một trận người dùng chưa mở. Gỡ nó ra là làm sống lại đúng bug đó.

Nên **không đụng**. Cái nó gây ra thật sự là: 4 nút bị khoá và hai trang con báo "No match is
open" cho tới khi mở lại trận — khó chịu, nhưng không mất dữ liệu. Nếu vẫn muốn app tự mở lại
trận gần nhất khi URL không có `#match=`, đó là một dòng trong `cloud-sync.js` (lấy
`meta.matchCode` làm dự phòng cho hash) — **chưa làm, chờ duyệt riêng**, vì nó đổi hành vi mà
test trên đang mô tả.

### 14.5 CÒN LẠI: chạy `0025`

**`supabase/migrations/0025_match_tagging_columns.sql` chưa chạy.** Code đã lên; cho tới khi
migration chạy, `42501` vẫn còn — khác một điều: bây giờ app **nói ra** thay vì im lặng.

Chạy trong Supabase → SQL Editor, rồi kiểm bốn thứ ghi ở đầu file migration (và §9.1).
Sau đó làm §9.3 để chữa lại trận 37138 và 91333 — **trước khi** xoá site data hay mở trận khác
trên chiếc máy đang giữ bản sao duy nhất.
