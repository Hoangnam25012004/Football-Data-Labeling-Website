# Per-user Hotkeys + Macros — Detailed Design

**Danh sách event là tài sản chung của cả website và ở nguyên như thế. Cái đang bị đặt nhầm chỗ
là *hotkey*: nó nằm trong `public.event_types.key`, nên A đổi phím thì cả thế giới đổi theo.
Còn *macro* thì ngược lại — nó chưa bao giờ rời khỏi `localStorage` của một trình duyệt, nên
đổi domain một cái là mất sạch. Tài liệu này mô tả cách tách ba thứ ấy về đúng chỗ: **event =
chung, hotkey = riêng theo account, macro = riêng theo account**, với cloud là nguồn sự thật.**

Trạng thái: **đã triển khai** (2026-08-18). Q1→A · Q2→A · Q3→3A · Q4→tách PR riêng ·
Q5→để yên · Q6→**event types không ai được xoá; row trong bảng Events của tagger thì ai
cũng sửa/xoá được như cũ**.

Phạm vi đã làm: `supabase/migrations/0020_user_prefs.sql` (mới), `index.html`, `cloud-sync.js`,
`tests/user-prefs.test.js` (mới, 41 test), `tests/harness.js` (thêm 2 tên hàm vào danh sách
lift), `tests/macro-hotkeys.test.js` (1 test đổi theo hành vi mới), `tests/asset-versions.json`.

Test: `node tests/run.js` → **1171/1171 passed**. Trong đó **1127 test cũ pass mà không sửa
một dòng nào**; test cũ duy nhất phải đổi là `macros are kept in their own store`, vì nó khẳng
định đúng cái điều lần này cố ý thay đổi (macro không lên cloud).

**Cam kết 0 dòng thay đổi:** `shared.js` · `Stats/*` · `Player-Lists/*` · `client/**` ·
`worker/**` · `auth.js` · `auth.html` · `shared.css` · `.github/workflows/deploy.yml` ·
`supabase/migrations/0001…0019` (mọi migration cũ). Lý do từng file ở §7.

**Cache-bust:** `cloud-sync.js` đổi ⇒ bump `?v=49` → `?v=50` tại [index.html:4131](../index.html:4131)
và `tests/asset-versions.json`. `shared.js` **không** đổi nên `Stats/index.html` và
`Player-Lists/index.html` giữ nguyên `?v=21`.

**deploy.yml:** không đổi. `supabase/` không nằm trong danh sách `cp` (migration chạy bằng
`supabase db push`, không phục vụ qua web), `index.html` và `cloud-sync.js` đã có dòng `cp` từ trước.

---

## 0. Hai thứ phát sinh khi làm, không có trong bản thiết kế

Cả hai đều là lỗi **do chính thay đổi này sinh ra**, tìm thấy lúc chạy thử nên đã sửa luôn.

**0.1 — Event tạo lúc chưa có cloud thì mất phím.** `resolveKeys()` đọc phím của một event
theo thứ tự "map của tôi → mặc định của site". Một event vừa `＋` tạo ra chưa có mặt trong
`siteKeys` (cloud chưa echo hàng về, và offline thì không bao giờ). Nên lần `resolveKeys()`
kế tiếp — chỉ cần đổi phím của **một event bất kỳ khác** — nó đọc ra rỗng và **xoá mất phím
của event vừa tạo**. Sửa bằng `seedSiteKeys()` gọi trong `saveEvents()`: mã lúc tạo chính là
mặc định của site cho tới khi cloud nói khác, và **chỉ điền chỗ còn trống** nên phím của
event đã có sẵn không bị mã của tôi ghi đè. Có 2 test giữ chỗ này.

**0.2 — Phím tôi đã bỏ trống, `✎ Edit` lại trả về mã của người tag.** Bản thiết kế nói "để
nguyên như đã gõ, validation sẽ lên tiếng". Sai — nếu mã ấy trong bàn phím của tôi là **một
event khác**, validation không lên tiếng gì cả và row bị ghi thành event khác. Đúng cái lỗi
mà `retypeForMe` sinh ra để chặn. Nay:

- **một row**: trả về **số áo không kèm mã** — entry không mã sẽ tag lại `state.activeEvent`,
  mà `startEdit` vừa đặt đúng bằng event của row đó. An toàn *và* đúng.
- **trong chain**: chỉ để nguyên mã khi nó **không mang nghĩa gì** với tôi; nếu nó mang nghĩa
  khác thì thay bằng `freeCode()` — một mã không ai sở hữu — để cổng nhập **từ chối to và rõ**
  thay vì ghi sai lặng lẽ.

---

## 1. Vấn đề

### 1.1 Chuyện vừa xảy ra

40 macro biến mất. Nguyên nhân đã xác định ở phiên trước: site chuyển sang custom domain
`hoangnams.com`, mà macro chỉ sống ở `localStorage['pitchtagger.macros.v1']` — localStorage gắn
theo **origin**, nên domain mới là một kho trắng. Event thì không sao, vì chúng nằm trên
Supabase và tự tải về.

Đó không phải tai nạn, đó là hệ quả tất yếu của mô hình lưu trữ. Bất kỳ chuyện nào sau đây đều
cho ra cùng một kết quả: đổi máy, đổi trình duyệt, dùng máy ở CLB, xoá site data, chế độ ẩn danh,
`http://` vs `https://`. Macro sẽ còn mất nữa nếu không đổi mô hình.

### 1.2 Chuyện đang sai về mặt mô hình

`public.event_types` đang giữ **cả tên event lẫn hotkey** trong một hàng, dùng chung cho mọi
người ([0003_event_types.sql](../supabase/migrations/0003_event_types.sql)):

```sql
create table public.event_types (
  id uuid primary key, sport text, event_name text, key text, ord int, updated_at timestamptz,
  unique (sport, event_name)
);
```

Nên hôm nay:

- A đổi `pass success` từ `s` sang `p` → [cloud-sync.js:176](../cloud-sync.js:176) `onEventTypesChanged`
  → `pushEventTypes` upsert → realtime bắn về máy B → **bàn phím của B đổi giữa lúc B đang tag.**
- Không ai có bộ phím riêng. Người thuận tay trái, người quen layout khác, người tag chuyên về
  set-piece — tất cả bị ép dùng chung một bản đồ phím.

### 1.3 Yêu cầu (từ bạn)

| # | Yêu cầu | Nơi được thoả ở tài liệu này |
|---|---|---|
| R1 | Event là **chung** cho toàn website | §2, §3.1, §4.4 |
| R2 | Hotkey **riêng** theo account | §4.2, §5.1 |
| R3 | Macro **riêng** theo account | §4.3, §5.2 |
| R4 | Không sinh bug ở các chức năng/tab khác | §3.2, §7, §8, §10 |
| R5 | Không đổi tính năng khác khi chưa cho phép | §7 (hàng rào), §6 (một ngoại lệ **bắt buộc phải xin phép**) |

---

## 2. Ranh giới: cái gì chung, cái gì riêng

| Dữ liệu | Phạm vi | Nguồn sự thật | Ai được sửa |
|---|---|---|---|
| Tên event (`pass success`, `goal kick`…) | **Chung toàn site** | `public.event_types.event_name` | mọi analyst (như hiện nay) |
| Thứ tự event (`ord`) | **Chung toàn site** | `public.event_types.ord` | mọi analyst (như hiện nay) |
| Hotkey **mặc định của site** | **Chung toàn site** | `public.event_types.key` | chỉ khi **tạo mới** một event (§5.3) |
| Hotkey **của tôi** | **Riêng theo account** | `public.user_prefs.hotkeys` | chỉ chính chủ (RLS) |
| Macro **của tôi** | **Riêng theo account** | `public.user_prefs.macros` | chỉ chính chủ (RLS) |
| Event đã tag (`public.events`) | Theo trận, chung | `public.events` | như hiện nay, **không đụng** |

Điểm mấu chốt cho R1: **`event_types` vẫn là danh sách duy nhất, vẫn realtime, vẫn ai cũng thấy
như nhau.** Thứ bị lấy ra khỏi nó chỉ là *quyền của một cá nhân ghi đè phím cho tất cả*.

---

## 3. Khảo sát mã hiện tại — bằng chứng cho cam kết "không vỡ chỗ khác"

### 3.1 Ai đọc `ev.key`

Toàn bộ, không sót:

| Nơi | Dùng để làm gì |
|---|---|
| [index.html:1988](../index.html:1988) `updateBanner` | hiện `[s]` cạnh tên event đang chọn |
| [index.html:1990](../index.html:1990) `setKey` | ô nhập phím trong bảng Event |
| [index.html:2008](../index.html:2008) `renderEvents` | vẽ ô phím |
| [index.html:2024](../index.html:2024) `nextFreeKey` | cấp phím trống khi tạo event mới |
| [index.html:2111](../index.html:2111) `eventForKey` | gõ → tên event |
| [index.html:2123](../index.html:2123) `expandKey` | một token → danh sách `{key,name}` |
| [index.html:2147](../index.html:2147) `expandMacros` | viết macro ra dạng dài |
| [index.html:2402](../index.html:2402) submit | `action:ev.key` ghi vào row |

Tất cả đều đọc qua `curEvents()` ([index.html:1979](../index.html:1979)), tức
`state.events[state.sport]`, hình dạng `[{name,key}, …]`.

> **Đây là chỗ tựa của cả thiết kế:** nếu `state.events` **giữ nguyên hình dạng** và chỉ đổi
> *nguồn* của `.key`, thì tám nơi trên **không cần sửa một ký tự nào**. Xem §4.2.

### 3.2 Ai KHÔNG đọc hotkey — và vì thế không thể vỡ

Đã grep toàn repo:

- **`shared.js`** — `PT_KEYS` chỉ có `events, lineups, lineupsMatch, duration, rows, meta`.
  Không có macro, và không đọc `.key` của event.
- **`Stats/stats-view.js`, `Stats/report.js`** — làm việc hoàn toàn bằng **tên** event
  (`event_name`). Chuỗi `.key` duy nhất trong file là `s.key` của *film slicer* và `saved.key`
  của Supabase anon key — không liên quan.
- **`Player-Lists/index.html`** — `.key` duy nhất là `srt.key` (khoá sắp xếp bảng).
- **`client/**`** (landing, app.html, film-tools) — không hề biết đến bảng Event.
- Listener `storage` giữa các tab: [index.html:1006](../index.html:1006) chỉ nghe `LU_STORE`;
  [Stats/stats-view.js:2055](../Stats/stats-view.js:2055) nghe `rows/meta/duration/lineups`;
  [Player-Lists/index.html:638](../Player-Lists/index.html:638) nghe `meta/lineups`.
  **Không tab nào nghe `pitchtagger.events.v1`, và cũng sẽ không nghe khoá prefs mới.**

Kết luận: thay đổi này **không chạm được** vào Stats, Player-Lists, client site, film tools,
report PDF. Đó là dữ kiện, không phải lời hứa.

### 3.3 Chỗ nguy hiểm duy nhất: `row.action` và `row.raw`

Mỗi row lưu lại **phím lúc tag** chứ không chỉ tên event
([index.html:2402](../index.html:2402)):

```js
event:ev.name, playerFrom:ev.from, playerTo:ev.to||'', action:ev.key, raw, …
```

và cả hai đi lên cloud ([cloud-sync.js:35](../cloud-sync.js:35), `:40`) thành `action_code` +
`attributes.raw`. Rồi ✎ Edit dựng lại ô nhập **từ phím đó**:

```js
// index.html:3298
const syntax=((row.playerFrom||'')+(row.action||'')+(row.playerTo||''))||expandMacros(row.raw)||'';
// index.html:3321
$('playerInput').value=expandMacros(grpRows[0].raw||'');
```

Ngày hôm nay điều đó vô hại vì mọi người dùng chung một bộ phím. **Ngày mai thì không.** Đây là
bug duy nhất mà thay đổi này *tự sinh ra* nếu không xử lý — §6 dành trọn cho nó.

---

## 4. Kiến trúc đề xuất

### 4.1 Sơ đồ

```
                    public.event_types                 public.user_prefs
                 (chung — tên + ord + key mặc định)   (riêng — hotkeys + macros)
                            │                                   │
        realtime: mọi client│                  realtime: filter user_id=eq.<uid>
                            ▼                                   ▼
                       applyToApp()                      applyUserPrefs()
                            │                                   │
                    siteKeys{sport}{name}            state.hotkeys{sport}{name}
                            └───────────┬───────────────────────┘
                                        ▼
                                  resolveKeys()
                                        │
                       state.events = [{name, key}, …]   ← hình dạng KHÔNG đổi
                                        │
        ┌───────────────┬───────────────┼───────────────┬────────────────┐
   updateBanner    renderEvents    eventForKey     nextFreeKey      expandMacros
                                   expandKey → parseChain → submit
                        (tám nơi này: 0 dòng thay đổi)
```

### 4.2 Nguyên tắc trung tâm — *resolve tại điểm nạp, không phải tại điểm đọc*

`state.events` vẫn là `{football:[{name,key},…]}`. Thêm hai thứ **bên cạnh** nó:

```js
state.hotkeys = { football: { "pass success":"p", "recovery":"" } }   // của TÔI
let siteKeys  = { football: { "pass success":"s", "recovery":"q" } }  // mặc định của site
```

và một hàm hợp nhất, gọi mỗi khi một trong hai đổi:

```js
/* '' trong state.hotkeys nghĩa là "tôi CỐ Ý bỏ trống phím này";
   thiếu hẳn entry nghĩa là "cho tôi mặc định của site".
   Hai cái đó khác nhau — dùng hasOwnProperty, đừng dùng `||`. */
function resolveKeys(){
  SPORTS.forEach(sp=>{
    const mine=state.hotkeys[sp]||{}, site=siteKeys[sp]||{};
    (state.events[sp]||[]).forEach(e=>{
      e.key = Object.prototype.hasOwnProperty.call(mine,e.name) ? mine[e.name] : (site[e.name]||'');
    });
  });
}
```

Hệ quả: mọi hàm ở §3.1 tiếp tục đọc `e.key` như cũ và không biết gì về chuyện đã xảy ra. Đó
chính là điều làm cho R4/R5 khả thi.

### 4.3 Schema mới — `0020_user_prefs.sql`

```sql
-- ============================================================
--  Sở thích của từng analyst: bàn phím riêng + macro riêng.
--  event_types vẫn là danh sách CHUNG; bảng này chỉ nói
--  "với danh sách chung ấy, TÔI gõ phím nào".
--  Thuần bổ sung: không rename, không drop, không đụng bảng cũ.
-- ============================================================
create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),

  -- {"football": {"pass success":"p", "recovery":""}}
  -- "" = cố ý bỏ trống; thiếu khoá = kế thừa event_types.key
  hotkeys    jsonb not null default '{}'::jsonb,

  -- {"football": [{"key":"qqs","events":["recovery","pass success"]}, …]}
  -- macro trỏ tới TÊN event, nên đổi phím không làm macro hỏng
  macros     jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

create or replace function public.touch_user_prefs()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists user_prefs_touch on public.user_prefs;
create trigger user_prefs_touch before update on public.user_prefs
for each row execute function public.touch_user_prefs();

-- ---------- RLS: chỉ chính chủ, cả đọc lẫn ghi ----------
alter table public.user_prefs enable row level security;

drop policy if exists user_prefs_own on public.user_prefs;
create policy user_prefs_own on public.user_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- realtime: để hai tab cùng account không lệch nhau ----------
alter table public.user_prefs replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='user_prefs'
  ) then
    alter publication supabase_realtime add table public.user_prefs;
  end if;
end $$;
```

Khác hẳn `event_types` (`for all to authenticated using (true)` — ai cũng đọc ghi được),
`user_prefs` đóng chặt bằng `user_id = auth.uid()`. Không analyst nào đọc hay sửa được bàn phím
của người khác, kể cả cố tình.

### 4.4 Vì sao một hàng JSONB, chứ không phải bảng quan hệ

Phương án thay thế là `user_hotkeys(user_id,sport,event_name,key)` +
`user_macros(user_id,sport,ord,key,events text[])`. Bác bỏ, vì:

1. **App vốn ghi cả cụm.** `saveEvents`/`saveMacros` xưa nay serialize nguyên object. Một
   `upsert` một hàng khớp đúng thói quen đó — **không cần logic diff/delete**.
2. **`pushEventTypes` đã cho thấy giá phải trả.** Nó phải `select` lại rồi `delete .in(id)` cho
   những hàng biến mất ([cloud-sync.js:162-167](../cloud-sync.js:162)). Đó chính là loại code dễ
   xoá nhầm. Không nhân bản nó thêm hai lần nữa.
3. **Macro là mảng có thứ tự, phần tử không có id ổn định.** Lưu quan hệ sẽ phải bịa `ord` và
   diff theo vị trí — mong manh.
4. **Một round-trip.** Vào trận: 1 `select`, mỗi lần đổi phím: 1 `upsert`.
5. **RLS đơn giản tới mức không thể sai.**

Đánh đổi phải nói rõ: không query được "ai đang gán phím `s`", và hai tab cùng account thì
last-write-wins. Cả hai chấp nhận được — §8 xử lý cái thứ hai bằng realtime.

---

## 5. Thay đổi phía ứng dụng

### 5.1 `index.html` — hotkey

**Thêm** (đặt ngay dưới khối macro hiện có, ~[index.html:1520](../index.html:1520)):

```js
/* ---- bàn phím của riêng tôi ----
   Danh sách event là của cả site; các phím gõ lên nó thì không. Cache theo user id,
   giống hệt cách pitchtagger.recent.v1 làm (xem recentUser()), để hai account dùng
   chung một máy không giẫm lên nhau. Cloud là nguồn sự thật; khoá này chỉ là bản sao
   để mở offline và để hiện lên ngay trước khi cloud kịp trả lời. */
const HK_STORE='pitchtagger.hotkeys.v1';
```

`loadHotkeys()` / `saveHotkeys()` viết theo đúng khuôn `recentAll()`/`rememberMatch()` đã có
([index.html:3913-3925](../index.html:3913)): blob ngoài cùng khoá theo `uid`.

**Sửa `applyEventTypes`** ([index.html:1487](../index.html:1487)) — thu `siteKeys` rồi resolve:

```js
function applyEventTypes(ev){
  SPORTS.forEach(sp=>{if(!ev[sp])ev[sp]=[]});
  siteKeys={}; SPORTS.forEach(sp=>{siteKeys[sp]={};
    ev[sp].forEach(e=>{siteKeys[sp][e.name]=e.key||''})});   // ← mặc định của site
  state.events=ev;
  resolveKeys();                                             // ← phím của TÔI đè lên
  try{localStorage.setItem(EV_STORE,JSON.stringify(ev));}catch(e){}
  if(!curEvents().some(e=>e.name===state.activeEvent))state.activeEvent=curEvents()[0]?.name||null;
  renderEvents(); renderMacros(); updateBanner(); updateStoreStatus();
}
```

**Sửa `setKey`** ([index.html:1990](../index.html:1990)) — ghi vào prefs, **không** ghi vào từ điển chung:

```js
function setKey(ev,val){
  val=(val||'').trim().toLowerCase().replace(/\s+/g,'');
  const mine=state.hotkeys[state.sport]||(state.hotkeys[state.sport]={});
  // vẫn chống trùng như cũ — nhưng gỡ phím của event kia trong bản đồ CỦA TÔI,
  // '' chứ không phải xoá entry: đây là "tôi cố ý bỏ trống", không phải "trả về mặc định"
  if(val) curEvents().forEach(o=>{if(o!==ev&&o.key===val)mine[o.name]='';});
  mine[ev.name]=val;
  saveHotkeys();                       // local + Cloud.onUserPrefsChanged()
  resolveKeys();
  renderEvents(); renderMacros(); updateBanner();
}
```

Đúng **một** dòng bị lấy đi khỏi hàm này: `saveEvents()`. Đó là toàn bộ khác biệt giữa "đổi phím
cho cả thế giới" và "đổi phím cho mình".

Việc **thêm / xoá / đổi tên** event vẫn gọi `saveEvents()` như cũ ⇒ vẫn là hành vi chung
(R1 giữ nguyên).

### 5.2 `index.html` — macro

`MAC_STORE` lên **v2**, khoá theo user, kèm di trú một lần từ v1:

```js
const MAC_STORE='pitchtagger.macros.v2';     // {uid:{sport:[…]}}
const MAC_V1='pitchtagger.macros.v1';        // di sản: {sport:[…]}, không khoá theo user
```

Quy tắc di trú (chạy đúng một lần cho mỗi user, khi cloud chưa có gì):

1. Cloud có `macros` không rỗng → dùng cloud, kết thúc.
2. Cloud rỗng và v2 có macro cho uid này → đẩy v2 lên cloud.
3. Cloud rỗng, v2 rỗng, **v1 tồn tại** → nhận v1 làm macro của user đang đăng nhập, ghi vào v2,
   đẩy lên cloud.
4. **Không bao giờ xoá v1.** Nó là lưới an toàn, và 40 macro vừa khôi phục sẽ vào nhà qua đúng
   nhánh 3 này.

`loadMacros()` giữ nguyên toàn bộ phần lọc/chuẩn hoá đang có
([index.html:1503-1515](../index.html:1503)) — chỉ đổi chỗ lấy blob.

### 5.3 `cloud-sync.js`

**Thêm** một khối song song với khối `event_types`:

```js
/* ---------- per-user preferences (hotkeys + macros) ---------- */
let applyingPrefs = false, upTimer = null, upChannel = null, prefsUid = null;

// Phiên ẩn danh (connect() có nhánh signInAnonymously) sinh uid dùng-một-lần.
// Ghi prefs vào đó là mất, đọc ra là rỗng — và cái rỗng ấy có thể đè lên bản thật.
// Nên: ẩn danh ⇒ chỉ local, không đọc không ghi cloud. Cùng luật với auth.js user().
const realUid = (session) => {
  const u = session && session.user;
  return (u && u.is_anonymous !== true) ? u.id : null;
};

async function initUserPrefs(session) {
  prefsUid = realUid(session);
  if (!prefsUid) return;
  const { data, error } = await sb.from('user_prefs')
    .select('hotkeys,macros,updated_at').eq('user_id', prefsUid).maybeSingle();
  if (error) { console.warn('user_prefs:', error.message); return; }   // ← lỗi mạng: KHÔNG đẩy gì cả
  const local = PT().localPrefs();          // {hotkeys,macros,at}
  if (!data)                    await pushUserPrefs(local);            // cloud trống: gieo từ máy này
  else if (local.at > Date.parse(data.updated_at)) await pushUserPrefs(local);  // sửa lúc offline thì mới hơn
  else {
    applyingPrefs = true;
    PT().applyUserPrefs({ hotkeys: data.hotkeys || {}, macros: data.macros || {} });
    applyingPrefs = false;
  }
  subscribeUserPrefs();
}
```

`pushUserPrefs` / `onUserPrefsChanged` / `subscribeUserPrefs` sao chép nguyên khuôn debounce +
cờ `applying` của `event_types` ([cloud-sync.js:167-180](../cloud-sync.js:167)), khác mỗi
`filter: 'user_id=eq.' + prefsUid` trên kênh realtime.

Trong `connect()`, chèn **sau** `initEventTypes()` ([cloud-sync.js:102](../cloud-sync.js:102)) —
thứ tự bắt buộc, vì phải có danh sách event rồi mới resolve phím lên nó:

```js
await initEventTypes();      // shared event dictionary (live)
await initUserPrefs(session); // ← MỚI: bàn phím + macro của riêng người này
```

**Sửa `pushEventTypes`** ([cloud-sync.js:154](../cloud-sync.js:154)) — thôi ghi đè `key`:

```js
// key chỉ được đặt khi event LẦN ĐẦU vào bảng: nó là "phím mặc định của site" mà người
// mới sẽ kế thừa. Sau đó nó bất động — phím của mỗi người nằm ở user_prefs.
const { data: existing } = await sb.from('event_types').select('id,sport,event_name');
const known = new Set((existing||[]).map(r => r.sport+'|'+r.event_name));
const rows = [];
Object.keys(events).forEach(sport => (events[sport]||[]).forEach((e,i) => {
  const r = { sport, event_name: e.name, ord: i };
  if (!known.has(sport+'|'+e.name)) r.key = e.key || null;   // ← chỉ khi tạo mới
  rows.push(r);
}));
```

> Lưu ý PostgREST: cột nào không có trong payload thì không nằm trong mệnh đề `SET` của
> `ON CONFLICT DO UPDATE`. Nhưng payload là **một mảng**, và PostgREST lấy **hợp** các khoá của
> mọi phần tử để dựng danh sách cột. Nên nếu một event mới đi chung lô với event cũ, cột `key`
> sẽ có mặt và event cũ bị `SET key = NULL`. Cách chắc chắn: **tách hai lần gọi** — một
> `upsert` cho hàng đã tồn tại (không có `key`), một `insert` cho hàng mới (có `key`).
> Đây là chi tiết dễ sai nhất trong cả thay đổi; test §10 chốt nó lại.

**Mở rộng `window.PT`** ([index.html:4129](../index.html:4129)): thêm `applyUserPrefs`,
`localPrefs`. Không bỏ khoá nào đang có.

---

## 6. ✎ Edit xuyên tài khoản — thay đổi **bắt buộc**, và tôi cần bạn cho phép

### 6.1 Bug

Phím thành của riêng ⇒ `row.action` (phím lúc tag) không còn ý nghĩa với người khác.

```
A gán "pass success" = s.   A tag → row{ event:"pass success", action:"s", raw:"1s2" }
B gán "pass success" = p, và B gán "shot" = s.
B mở trận, bấm ✎ trên row đó
  → ô nhập hiện "1s2"
  → B bấm Enter
  → parseChain đọc "s" theo từ điển của B → row bị đổi thành "shot"
```

Sửa im lặng, không báo lỗi, và ghi đè dữ liệu thật. Đây là bug nghiêm trọng nhất của cả thay đổi.
(Nó **đã** tồn tại ở dạng nhẹ hôm nay: đổi phím một event rồi Edit row cũ cũng cho kết quả sai —
nên bản sửa dưới đây là cải thiện thuần, kể cả nếu bỏ phần per-user đi.)

### 6.2 Sửa: dựng lại từ **tên**, không từ **phím** — và tự các row cho ta bảng tra

Row đã mang sẵn cả hai vế: `action` (phím người tag đã gõ) và `event` (tên). Ghép các row của một
chain lại là được **từ điển của người tag**, đúng thời điểm ấy:

```js
/* Phím là của riêng mỗi người, nên phím đã lưu trên row là phím của NGƯỜI TAG.
   Muốn mở nó ra trong bàn phím của người đang sửa, ta cần biết token ấy nghĩa là gì:
   chính các row nói ra điều đó (action -> event). Dịch từng token sang phím của
   người đang sửa, giữ nguyên mọi thứ còn lại — số áo, dấu '*', thứ tự.

   Khi người tag CŨNG là người sửa và chưa đổi phím, mỗi token ánh xạ về đúng chính nó:
   phép biến đổi là ÁNH XẠ ĐỒNG NHẤT, và chuỗi trả về giống hệt raw. Đó là lý do 1128
   test cũ không cần sửa một dòng. */
function retypeForMe(raw, rows){
  const map={};                                   // phím-của-người-tag -> tên event
  rows.forEach(r=>{ if(r.action && r.event && !(r.action in map)) map[r.action]=r.event; });
  return raw.replace(/[a-z]+/gi, tok=>{
    const name = map[tok.toLowerCase()] || eventForKey(tok.toLowerCase());
    if(!name) return tok;                         // macro của tôi / token lạ: để nguyên
    const mineNow = (curEvents().find(o=>o.name===name)||{}).key;
    return mineNow || tok;                        // tôi chưa gán phím: để nguyên, validation sẽ nói
  });
}
```

Rồi:

```js
// index.html:3298
const syntax=((row.playerFrom||'')+(myKeyFor(row.event)||row.action||'')+(row.playerTo||''))
             || retypeForMe(expandMacros(row.raw)||'', [row]) || '';
// index.html:3321
$('playerInput').value = retypeForMe(expandMacros(grpRows[0].raw||''), grpRows);
```

`expandMacros` **giữ nguyên**, chạy trước — macro của chính người đang sửa vẫn được viết ra dạng
dài đúng như hôm nay; `retypeForMe` chỉ dịch phím sau đó.

### 6.3 Vì sao đây là ngoại lệ của R5, và tôi hỏi trước

Sửa `startEdit`/`startEditGroup` **là** động vào một tính năng khác. Tôi không tự làm. Nhưng nó
cũng không phải tuỳ chọn: **không có nó, per-user hotkey sẽ âm thầm làm hỏng dữ liệu đã tag.**
Ba đường đi, bạn chọn ở **Q3**:

| | Cách | Hệ quả |
|---|---|---|
| **3A** | Làm `retypeForMe` như trên | Edit đúng xuyên tài khoản. Đụng 2 dòng ở `startEdit`/`startEditGroup`. **Đề xuất.** |
| **3B** | Chặn ✎ Edit khi `row.created_by` ≠ tôi | Không đụng logic parse, nhưng mất một tính năng đang có — vi phạm R5 nặng hơn 3A. |
| **3C** | Không làm gì | Có bug ăn dữ liệu. **Không nên.** |

---

## 7. Hàng rào: những gì **không** được đổi

| Thứ | Trạng thái | Vì sao phải giữ |
|---|---|---|
| `public.events` (schema + `action_code` + `attributes.raw`) | **0 thay đổi** | Vẫn ghi `action_code` như cũ để tab bản cũ còn chạy; chỉ thôi *đọc* nó cho Edit (§6). |
| `public.event_types` | **không rename, không drop cột** | Bỏ cột `key` sẽ giết mọi tab bản cũ còn mở (GitHub Pages cache HTML 10 phút). |
| Logic thêm/xoá/đổi tên event, `ord` | **0 thay đổi** | Đó là R1 — event vẫn chung. |
| `parseChain`, `expandKey`, `expandMacros`, `eventForKey`, `nextFreeKey`, `updateBanner`, `renderEvents` | **0 thay đổi** | Nhờ §4.2 resolve tại điểm nạp. |
| `shared.js`, `Stats/*`, `Player-Lists/*` | **0 dòng** | §3.2: không đọc hotkey/macro. |
| `client/**`, `worker/**`, `auth.js`, `auth.html` | **0 dòng** | Không liên quan. |
| `updateStoreStatus` che lỗi lưu ([index.html:1521](../index.html:1521)) | **để nguyên trong lần này** | Là bug thật, nhưng là bug *khác*. Xem **Q4**. |
| Sửa nút `Backup` không tồn tại ([index.html:1526](../index.html:1526)) | **để nguyên** | Sau khi macro lên cloud, câu chữ ấy còn sai theo kiểu khác. Xem **Q5**. |
| `deploy.yml` | **0 dòng** | `supabase/` không phục vụ qua web; `index.html`/`cloud-sync.js` đã có `cp`. |

---

## 8. Realtime và nhiều tab

| Tình huống | Hôm nay | Sau thay đổi |
|---|---|---|
| A đổi phím, B đang tag | **Bàn phím B đổi giữa chừng** | B không thấy gì. Đúng như mong muốn. |
| A tạo event mới | B thấy event mới (realtime) | Y hệt — cộng thêm: B nhận `key` mặc định của site nếu phím đó còn trống với B |
| A xoá event | B mất event đó | Y hệt. Macro của B trỏ vào nó chuyển sang đỏ "no longer exists" — cơ chế đã có sẵn ([index.html:2067](../index.html:2067)) |
| **Cùng một account, 2 tab tagger** | macro lệch nhau vĩnh viễn | Kênh realtime lọc `user_id=eq.<uid>` kéo tab kia về đúng, debounce 150 ms |
| Tab Stats / Player-Lists mở song song | — | **Không đổi gì.** Không tab nào nghe khoá prefs; chúng chỉ dùng tên event |
| Hai account trên cùng một trình duyệt | macro trộn vào nhau (v1 không khoá theo user) | Tách sạch: cache local khoá theo `uid`, cloud khoá bằng RLS |
| Mất mạng giữa chừng | — | Sửa vẫn vào localStorage; `local.at > updated_at` đẩy lên khi có mạng lại (§5.3) |
| Phiên ẩn danh | — | Chỉ local, không đọc/ghi cloud (§5.3) |

---

## 9. Thứ tự triển khai

1. **`supabase db push`** migration `0020`. Thuần bổ sung ⇒ tab bản cũ đang chạy không hề hấn gì.
2. **Deploy app.** Trong ~10 phút cache của GitHub Pages sẽ có cả tab cũ lẫn tab mới:
   - Tab **cũ** đọc `event_types.key` → vẫn chạy bằng bộ phím chung. Không lỗi.
   - Tab **mới** đọc `user_prefs` → bộ phím riêng.
   - Hai bên **không giẫm chân nhau**: tab mới không ghi `event_types.key`, tab cũ không biết
     `user_prefs` tồn tại.
3. **Không có bước 3.** Cột `event_types.key` **ở lại vĩnh viễn** với vai trò mặc định của site.

Rollback: revert commit app. Bảng `user_prefs` nằm im, `event_types.key` chưa từng bị đụng ⇒
hành vi cũ trở lại nguyên vẹn. Không mất dữ liệu ở bất kỳ chiều nào.

---

## 10. Kế hoạch test

Harness lấy hàm thẳng từ `index.html` bằng cách quét tên + đếm ngoặc
([tests/harness.js](../tests/harness.js)), nên đổi tên hàm là fail ngay — cố ý như vậy.

### 10.1 Suite cũ phải xanh, không sửa một dòng

`macro-hotkeys` · `entry-numbers` · `entry-autocomplete` · `events-table` · `goal-spot` ·
`receiver-dots` · `quiet-tagging` · `submit-analysis` · `card-timeline` · `substitution` ·
`period-time-edit` · `match-cloud-split`. **1128/1128.**

Chốt chặn quan trọng nhất: `retypeForMe` là ánh xạ đồng nhất khi người tag = người sửa (§6.2),
nên hai test `✎ Edit on a macro chain opens its long form` và `a chain that never held a macro is
edited exactly as before` phải pass **nguyên văn**. Nếu chúng đỏ thì thiết kế sai, không phải test sai.

### 10.2 Test mới — `tests/user-prefs.test.js` (~34)

**Resolve phím (7)** — phím của tôi thắng mặc định site · thiếu entry thì kế thừa site ·
`''` là "cố ý trống" chứ không rơi về site · site không có thì không gán ·
event mới xuất hiện qua realtime được resolve · đổi `sport` resolve lại đúng nhóm ·
`resolveKeys` không đổi `name`/`ord`.

**Cách ly giữa các account (5)** — phím A đặt không lọt vào từ điển của B ·
`setKey` **không** gọi `saveEvents()` · `setKey` **không** gọi `Cloud.onEventTypesChanged()` ·
chống trùng phím chỉ ghi vào bản đồ của tôi · macro A không hiện ở B.

**Event vẫn chung (4)** — thêm event ⇒ vẫn `saveEvents()` + đẩy cloud · xoá event ⇒ như cũ ·
`ord` vẫn đẩy · `applyEventTypes` từ cloud vẫn thay cả danh sách.

**`pushEventTypes` không ăn mất `key` (4)** — event đã tồn tại: payload **không** chứa `key` ·
event mới: payload **có** `key` · lô trộn cũ+mới: **hai lần gọi tách biệt** (bẫy PostgREST ở §5.3) ·
đường xoá hàng không đổi.

**Macro theo user + di trú (6)** — v1 → v2 nhận đúng một lần · **v1 không bị xoá** ·
hai uid trên cùng trình duyệt không trộn · cloud có macro thì cloud thắng · cloud rỗng thì gieo từ local ·
macro vẫn trỏ theo **tên** nên đổi phím không hỏng.

**✎ Edit xuyên tài khoản (5)** — row tag bằng `s` của A mở ra `p` với B ·
người tag = người sửa ⇒ chuỗi ra **giống hệt** raw · chain nhiều row dịch đúng từng token ·
số áo và `*` không bị đụng · event tôi chưa gán phím ⇒ giữ nguyên token, validation cũ lên tiếng.

**Luật an toàn dữ liệu (3)** — `select` lỗi ⇒ **không** đẩy gì lên · phiên ẩn danh ⇒ không đọc
không ghi cloud · `local.at` mới hơn `updated_at` ⇒ local thắng.

### 10.3 Test tĩnh

- `asset-versions.test.js`: `cloud-sync.js` v49 → v50 và `?v=` trong `index.html` khớp.
- Kiểm tra migration `0020` **chỉ có** `create table if not exists` / `create policy` /
  `alter publication` — **không** `drop table`, `alter … drop column`, `rename`
  (cùng khuôn với test "the migration only adds" đã có ở suite `contact-form`).
- Kiểm tra không file nào phục vụ cho trình duyệt có thể đọc `user_prefs` của người khác.

---

## 11. Rủi ro

| Rủi ro | Mức | Cách chặn |
|---|---|---|
| `pushEventTypes` set `key=NULL` cho event cũ (bẫy PostgREST §5.3) | **Cao** | Tách `upsert` và `insert`; 4 test riêng; `key` chỉ là mặc định nên kể cả lỡ NULL thì phím *của người dùng* vẫn còn ở `user_prefs` |
| ✎ Edit ghi sai event | **Cao** | §6, 5 test, tính chất ánh xạ đồng nhất |
| Prefs rỗng đè lên bản thật | Trung bình | Lỗi `select` ⇒ không đẩy; cloud trống mới gieo; so `updated_at` |
| Phiên ẩn danh nuốt prefs | Trung bình | `realUid()` chặn từ đầu |
| Tab cũ và tab mới đá nhau lúc deploy | Thấp | Hai đường ghi rời nhau hoàn toàn (§9) |
| Macro v1 mất trong lúc di trú | Thấp | Không bao giờ xoá v1 |
| Quota localStorage | Thấp | Prefs ~vài KB; và cloud mới là nguồn sự thật |

---

## 12. Câu hỏi cần bạn chốt

Tất cả đã chốt và đã làm; giữ lại đây để biết vì sao mỗi thứ ra như vậy.

**Q1 — Chỗ lưu.** → Một hàng JSONB `user_prefs` (§4.4).

**Q2 — Người dùng mới mở app lần đầu.** → **A**: kế thừa toàn bộ phím mặc định của site, mở
lên giống hệt hôm nay. Trong bản cài đặt, "kế thừa" = **không có entry nào** trong
`user_prefs.hotkeys`; chỉ khi đổi phím mới sinh ra một dòng.

**Q3 — ✎ Edit (§6.3).** → **3A** `retypeForMe`, cộng phần siết thêm ở §0.2.

**Q4 — Badge trạng thái.** `updateStoreStatus` đang `return` sớm khi có cloud nên nuốt luôn cảnh
báo `STORAGE_OK=false` ([index.html:1521](../index.html:1521)). → **tách PR riêng**, không đụng tới trong lần này.

**Q5 — Backup/Restore JSON.** Sau khi lên cloud thì nó bớt cấp thiết, nhưng dòng chữ
`⚠ can't save — use Backup` vẫn trỏ tới một nút không tồn tại. → **để yên**, không đụng tới trong lần này.

**Q6 — Ai được xoá event chung?** → **Không ai.** Đã làm, hai lớp:
- Nút `×` biến khỏi bảng **Event types** (`renderEvents`).
- `pushEventTypes` bỏ hẳn đoạn xoá — nên kể cả một tab có từ điển cục bộ thiếu sót cũng
  không thể xoá hàng khỏi bảng chung. Bảng `event_types` giờ chỉ được **thêm** và **sắp lại thứ tự**.

Bảng **Events trong tag Tagger** không đổi một dòng: `✎` và `✖` trên từng row vẫn như cũ, ai
cũng sửa và xoá được — đó là công việc của một người trên một trận, không phải tài sản chung.

---

## 13. Ngoài phạm vi

Chia sẻ bộ phím giữa các account ("dùng layout của A") · bàn phím theo môn thể thao riêng biệt
ngoài cấu trúc `{sport:{…}}` đã có · lịch sử/hoàn tác cho prefs · đẩy telestration
(`hna.film.tools.v1`) và danh sách trận gần đây (`pitchtagger.recent.v1`) lên cloud — cùng một
căn bệnh local-only, nhưng là công việc riêng.
