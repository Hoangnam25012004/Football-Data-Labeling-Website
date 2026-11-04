# Submit Analysis Gate — Detailed Design

**`⇪ Submit Analysis` chỉ đẩy được trận đấu sang client khi trận ấy vượt qua **bảy điều kiện**.
Trượt bất kỳ điều kiện nào ⇒ **không publish**, và hộp thoại nói rõ **trượt ở điều kiện nào**.
Riêng lỗi *vị trí bóng shot on target* và lỗi *số áo*, thông báo chỉ thẳng **từng thời điểm**
trên đồng hồ trận đấu (hiệp + phút:giây), để Analyst tìm được đúng dòng mà sửa.**

Trạng thái: **đã triển khai** (2026-08-15). Q1→B · Q2→A · Q3→A · Q4→A · Q5→A (bấm-để-nhảy
để Phase 2) — bạn chốt cả năm theo đề xuất, chi tiết ở §19. Nối tiếp
[`entry-number-gate-design.md`](entry-number-gate-design.md) (cổng số áo lúc **gõ** entry) và
[`submit-lineup-design.md`](submit-lineup-design.md) (Submit home / Submit away). Tài liệu này
là **cổng thứ hai**: cổng lúc **xuất bản**.

> **Hai cổng không trùng nhau.** Cổng ở `submitEntry()` phán xét **một entry, tại lúc gõ nó**.
> Cổng ở đây phán xét **cả trận, tại lúc đóng băng nó**. Ba lý do khiến cổng thứ hai không thừa —
> chúng là xương sống của tài liệu này, xem §4:
> 1. **Không thể** kiểm C1–C5 lúc gõ: nửa còn lại của một pha tranh chấp nằm ở một entry khác,
>    có thể được gõ sau đó vài phút.
> 2. Một dòng **hợp lệ lúc gõ** vẫn có thể trở thành **sai về sau** — sửa giờ một substitution,
>    xoá một sub, thêm một thẻ đỏ đều **viết lại quá khứ** của formation (§4.2).
> 3. Payload publish **đọc từ database**, không đọc từ tab này. Dòng do tab khác / bản cũ /
>    lần tag trước ghi vào chưa từng đi qua cổng entry một lần nào (§5).

Phạm vi đã làm: **`index.html`** (toàn bộ luật mới + hộp thoại), **`cloud-sync.js`** (đúng
*2 dòng code* — một tham số `gate` truyền vào `publishReport`, §9.2), `tests/analysis-gate.test.js`
(mới, 52 test), `tests/harness.js` (chỉ *thêm* tên hàm vào `FUNCS`/`CONSTS`), và **3 test cũ
được cập nhật** vì chúng khoá hình dạng source của đúng thứ vừa đổi (§15).
`shared.js` = 0 dòng, `Player-Lists/*` = 0 dòng, `Stats/*` = 0 dòng, `client/*` = 0 dòng.
Không đổi schema, không migration.

**Đã cache-bust:** `cloud-sync.js` `?v=48` → `?v=49` ở `index.html`, manifest regenerate bằng
`node tests/asset-versions.test.js --update`. Đây là cái giá của §9.2 phương án B; §9.3 nêu
phương án A không tốn cache-bust nhưng có khe hở TOCTOU.

Test: `node tests/run.js` → **937/937 passed**. Trong đó **882 test cũ pass mà không sửa một
dòng nào**, 3 test cũ được cập nhật theo hình dạng mới, cộng 52 test mới.

> **Ràng buộc ngôn ngữ:** `tests/auth-gate.test.js:406-414` khoá `index.html` và `cloud-sync.js`
> **không được có tiếng Việt**, kể cả trong comment. Mọi chuỗi thông báo và comment code trong
> tài liệu này đều viết bằng tiếng Anh. Tài liệu nằm trong `docs/` nên không thuộc danh sách đó.

---

## 1. Mục tiêu và ranh giới

| Yêu cầu của bạn | Thiết kế đáp ứng ở |
|---|---|
| aerial duel of home = aerial duel of away | §6.1 — **C1** |
| aerial duel success of home = aerial duel fail of away (và ngược lại) | §6.1 — **C2** |
| ground duel of home = ground duel of away | §6.1 — **C3** |
| ground duel success of home = ground duel fail of away (và ngược lại) | §6.1 — **C4** |
| take-on success of home = take-on concern of away (và ngược lại) | §6.1 — **C5** |
| shot on target phải có vị trí bóng tại khung thành | §6.2 — **C6** |
| số áo đúng với cầu thủ trên sân **tại thời điểm đó**, theo formation từng lúc của mỗi bên | §6.3 — **C7** |
| Không đáp ứng ⇒ **không submit được** | §9 — cổng đặt trước RPC `publish_match_report`; §13 bất biến I1–I4 |
| Báo **lỗi tại điều kiện nào** | §10 — bảng bảy dòng ✓/✗, cả bảy luôn được chấm, không dừng sớm |
| Lỗi C6 / C7 phải chỉ rõ **thời điểm** (phút theo timeline) | §7 đồng hồ; §11 định dạng dòng lỗi |

**Ngoài phạm vi (nói rõ để khỏi trôi):**

- Không sửa cách **tag** một pha tranh chấp. Cổng này chỉ **đếm** cái đã tag.
- Không kiểm chiều đúng/sai của một cặp `sub` (ai ra, ai vào) — `planSubGroup()` đã làm việc đó
  lúc gõ, và snapshot trong `lineups.history` là nguồn chân lý. Xem §6.3.5.
- Không đụng vào `EVENT_INC` / cách Stats đếm. Có một sai chính tả đáng lo trong đó — §18.2.
- Không thêm điều kiện nào ngoài bảy điều kiện trên. `take-on fail` **không** có vế đối ứng
  trong danh sách của bạn, và tài liệu này cố ý **không** tự bịa ra một vế cho nó (§6.1.4).

---

## 2. Hiện trạng: cổng Submit hôm nay kiểm những gì

Hộp thoại nằm ở `index.html:3677-3737`. Toàn bộ phần "có được publish không" gói trong đúng
**một** biến:

```js
// index.html:3708-3718
const short = built.localCount > 0 && built.eventCount < built.localCount;
…
$('submitGo').disabled = short;
```

| Đã kiểm | Ở đâu | Nội dung |
|---|---|---|
| Đã kết nối cloud & đã mở trận | `:3691` | `Open a match on the cloud first…` |
| Có kênh (club) để publish sang | `:3698` | `There is no channel to publish to yet.` |
| DB có ít event hơn tab này | `:3710` | `⚠ The database is behind this tab…` → **chặn** |
| Không có line-up | `:3714` | `⚠ No starting line-up saved for this match.` → **cảnh báo suông, vẫn publish được** |
| **Nội dung dữ liệu có nhất quán không** | — | **không có gì** |

Nói cách khác: hôm nay cổng chỉ kiểm **đường truyền** (đã đồng bộ xong chưa), tuyệt đối không
kiểm **nội dung**. Một trận có 34 aerial duel bên Home và 12 bên Away vẫn publish trơn tru, và
CLB đọc được một bản báo cáo mà mọi con số trong đó đều tự cộng đúng — kiểu sai khó phát hiện
nhất, đúng như comment ở `cloud-sync.js:411` đã nói về một chuyện khác.

Ba lỗ hổng cụ thể, gõ được ngay hôm nay:

**(a) Tranh chấp một chiều.** Tag `9b` (aerial duel success) cho Home mà quên `4bb` cho Away.
Không có gì kêu. Trong Stats, `Aerial Duels` của Home = 1, của Away = 0 — hai đội vừa nhảy
tranh một quả bóng mà chỉ một người có mặt.

**(b) Shot on target không có vị trí.** `submitEntry()` giữ entry lại cho tới khi có `goalCapture`
(`index.html:2315-2325`) — nhưng điều kiện là `GOAL_SPOT_EVENTS.has(e.name)`, một `Set` khớp
**phân biệt hoa thường** (`index.html:1248`). Danh sách event lại **do người dùng sửa được**.
Đổi tên event thành `"Shot On Target"` là khung thành **không mở ra nữa**, dòng được ghi thẳng
với `gXY = null`, và các bản đồ sút trong Stats mất luôn quả đó. `tests/event-name-case.test.js`
đã ghi nhận đúng lớp lỗi này ở chỗ khác (`"throw-Ins"` đếm bằng 0).

**(c) Số áo hợp lệ lúc gõ, sai lúc publish.** Xem §4.2 — đây là lỗ hổng nghiêm trọng nhất và
cổng entry **theo thiết kế** không thể vá được.

---

## 3. Bảy điều kiện, viết thành mệnh đề

Ký hiệu: `N(side, event)` = số dòng của `side` có tên event chuẩn hoá bằng `event`, trên
**toàn trận** (payload đã publish, xem §5).

| # | id | Mệnh đề |
|---|---|---|
| C1 | `aerial-total` | `N(H,ads) + N(H,adf)  =  N(A,ads) + N(A,adf)` |
| C2 | `aerial-mirror` | `N(H,ads) = N(A,adf)` **và** `N(H,adf) = N(A,ads)` |
| C3 | `ground-total` | `N(H,gds) + N(H,gdf)  =  N(A,gds) + N(A,gdf)` |
| C4 | `ground-mirror` | `N(H,gds) = N(A,gdf)` **và** `N(H,gdf) = N(A,gds)` |
| C5 | `takeon-mirror` | `N(H,tos) = N(A,toc)` **và** `N(H,toc) = N(A,tos)` |
| C6 | `shot-spot` | `∀ r ∈ rows : ev(r) ∈ {shot on target, goal} ⇒ r.gXY ≠ null ∧ r.gXY ∈ [0,100]²` |
| C7 | `shirt-numbers` | `∀ r ∈ rows, ∀ n ∈ numbers(r) : n ∈ Squad(r.team, r.t)` — và nếu `ev(r) ∉ OFF_PITCH_OK` thì `n ∈ XI(r.team, r.t)` |

(`ads` = aerial duel success, `adf` = aerial duel fail, `gds/gdf` = ground duel, `tos` = take-on
success, `toc` = take-on concern; `H/A` = home/away.)

### 3.1 C1 là **hệ quả** của C2, C3 là hệ quả của C4

```
N(H,ads) = N(A,adf)  ⋀  N(H,adf) = N(A,ads)
⇒ N(H,ads) + N(H,adf) = N(A,adf) + N(A,ads)
⇒ C1
```

Nghĩa là: **kiểm C2 là đủ để C1 đúng**. Chiều ngược lại **không** đúng — Home có thể thắng 20
thua 14, Away thắng 14 thua 20, tổng vẫn bằng nhau (34 = 34), mà từng vế lệch nhau 6.

Thiết kế **vẫn hiện đủ bảy dòng** trên bảng, vì:

- Bạn đã yêu cầu bảy điều kiện, và bảy dòng ✓/✗ là thứ đọc được, đối chiếu được với yêu cầu.
- Dòng tổng là **triệu chứng dễ đọc nhất** ("Home 34, Away 31"), dòng mirror là **chẩn đoán**
  ("thiếu 3 ở vế *thua* của Away"). Ẩn dòng tổng đi là lấy mất câu tóm tắt.

Nhưng thiết kế **ghi thẳng vào code** rằng C1/C3 là dẫn xuất, để người sau không tưởng đó là hai
luật độc lập rồi đi "sửa" một trong hai:

```js
/* C1 and C3 are IMPLIED by C2 and C4 — a side's total is its wins plus its losses, so
   two mirrored identities force the totals to agree. They are still evaluated and still
   shown, because the total is the line an analyst reads first ("Home 34, Away 31") and
   the mirror is the line that says where to look. Never one without the other. */
```

Bất biến tự kiểm **I7** (§13) khoá đúng quan hệ này.

---

## 4. Vì sao cổng phải nằm ở đây, chứ không phải ở `Enter event`

Đây là câu hỏi phải trả lời trước khi viết một dòng code nào, vì đã có sẵn một cổng ở
`submitEntry()`.

| Điều kiện | Cổng entry bắt được không? | Vì sao |
|---|---|---|
| C1–C5 | **Không, về nguyên tắc** | §4.1 |
| C6 | **Một phần** | Có chặn (`:2315`), nhưng thủng khi event bị đổi tên hoa/thường, và không phủ được dòng đến từ cửa khác (§5) |
| C7 | **Một phần** | Có chặn (`checkEntryNumbers`), nhưng **hợp lệ lúc gõ ≠ hợp lệ mãi mãi** (§4.2) |

### 4.1 C1–C5 không thể là luật của một entry

Một pha không chiến là **hai** entry: `9b` cho Home và `4bb` cho Away. Chúng là hai lần gõ
`Enter`, hai lần đặt dot, và giữa chúng Analyst có thể tua đi tua lại, tag mười pha khác, hay
nghỉ ăn trưa. Tại thời điểm gõ `9b`, câu hỏi "vế còn lại đâu?" **không có câu trả lời đúng**:
chưa có không có nghĩa là sai, chỉ có nghĩa là *chưa*.

Cân bằng tranh chấp là một mệnh đề về **trạng thái cuối** của trận đấu. Nó chỉ có nghĩa ở đúng
một khoảnh khắc: khi Analyst tuyên bố trận đã tag xong. Khoảnh khắc đó **chính là** `⇪ Submit
Analysis`. Đây không phải chỗ tiện tay đặt cổng — đây là chỗ **duy nhất** mệnh đề tồn tại.

### 4.2 Một dòng hợp lệ lúc gõ vẫn có thể sai về sau

Đây là lập luận mạnh nhất cho C7, và nó là một **lỗ hổng thật, tái hiện được**:

```
1.  Home submit đội hình. Số 21 ngồi ghế dự bị.
2.  Analyst tag  "7sub21"  ở 60:00  → snapshot: 21 vào sân.
3.  Analyst tag  "21qq"   ở 70:00  → cổng entry hỏi effectiveLU(home, 70:00):
                                      21 có trên sân. HỢP LỆ. Dòng được ghi.
4.  Analyst xem lại băng, thấy mình bấm sớm: sửa entry sub thành 75:00.
    submitEntry() gỡ snapshot cũ, đặt snapshot mới ở 75:00.
5.  Bây giờ dòng ở bước 3 nói: số 21 recovery ở phút 70 — trong khi 21 còn ngồi ghế.
```

**Không có gì chạy lại ở bước 4.** `checkEntryNumbers()` là luật *lúc ghi*; nó không đăng ký
theo dõi gì cả, và nó không có lý do gì để làm thế — chi phí của việc quét lại toàn bộ trận sau
mỗi lần sửa formation là vô nghĩa so với việc quét đúng **một lần**, lúc publish.

Cùng một hình dạng, ba đường khác:

| Thao tác về sau | Dòng nào thành sai |
|---|---|
| Sửa giờ một `sub` | Mọi dòng của người vào sân, nằm giữa giờ cũ và giờ mới |
| Xoá một `sub` | Mọi dòng của người vào sân, sau thời điểm đó |
| Thêm một `red card` ở phút sớm hơn | Mọi dòng của người bị đuổi, sau thời điểm ấy — `applyRedCard()` (`index.html:2751-2754`) còn **quét ngược** cả các snapshot muộn hơn để gỡ anh ta ra |
| Sửa đội hình xuất phát ở Player lists rồi Submit lại | Mọi dòng mang số áo vừa bị bỏ khỏi danh sách |

**Kết luận:** C7 ở cổng submit **không** phải là chạy lại cổng entry. Nó là câu hỏi khác:
*"với formation như nó **đang** là, mọi dòng **đã** ghi có còn đứng vững không?"* — và chỉ có
một chỗ trong vòng đời trận đấu để hỏi câu đó.

---

## 5. Nguồn dữ liệu: payload là chân lý, không phải tab này

`buildReport()` (`cloud-sync.js:427-464`) đã chốt nguyên tắc, và `tests/submit-analysis.test.js`
đã khoá nó lại: *snapshot đọc ngược ra từ database, không đọc từ localStorage của tab*. Cổng
kiểm tra **phải đứng cùng phía**:

```js
checkAnalysis(built.payload)      // ✅
checkAnalysis(state.rows)         // ❌ — kiểm một thứ, publish một thứ khác
```

Ba hệ quả:

1. **`checkAnalysis` là hàm thuần.** Không `$()`, không `state`, không `video`. Mọi thứ nó cần
   đều nằm trong payload: `rows`, `lineups` (kèm `history`), `dur`, `meta`. Điều này khiến nó
   test được y hệt `checkEntryNumbers` — nạp vào sandbox, đưa dữ liệu tay, đọc kết quả.
2. **Đồng hồ phải đọc từ `payload.dur`, không từ `state.duration`.** Hai cái có thể lệch nhau
   (tab chưa sync xong phần cấu hình). Phút mà thông báo lỗi in ra phải là phút mà **CLB** sẽ
   thấy. Đây là lý do §7 tồn tại.
3. **Cổng phủ được cả dòng chưa từng đi qua cổng entry:** dòng do tab thứ hai tag, dòng tag từ
   trước khi cổng entry ra đời, dòng tag khi trận chưa mở trên cloud
   (`checkEntryNumbers` tự tắt khi `!state.teamIds.matchId`, `index.html:2493`).

### 5.1 `payload.lineups` là `null` thì sao?

`buildReport()` chỉ lấy `m.lineups` khi có **cả** `home` và `away` (`cloud-sync.js:445`); nếu
không, `lineups: null`. Hôm nay hộp thoại chỉ cảnh báo suông rồi vẫn cho publish.

**Quyết định (đề xuất): C7 TRƯỢT CỨNG khi `payload.lineups` là `null`.** Không có đội hình thì
không có cách nào bảo chứng cho bất kỳ số áo nào, và publish một bản báo cáo như thế là đúng
cái mà `entry-number-gate-design.md` §5.1 đã từ chối ở đầu bên kia ("một hiệp toàn bộ event gán
cho những số áo không ai đứng ra bảo lãnh"). Cảnh báo suông biến thành lỗi cứng. Xem **Q3** (§19).

Thông báo:

```
✗ 7. Shirt numbers on the pitch
     This match has no line-up saved, so no shirt number in it can be vouched for.
     Open Player lists, then ⇪ Submit home and ⇪ Submit away.
```

---

## 6. Thiết kế từng điều kiện

### 6.0 Chuẩn hoá tên event — làm một lần, dùng cho cả bảy

Tên event **do người dùng sửa được** và được lưu theo trận. `shared.js:245` đã có `evKey`;
`index.html:3277` đã có bản sao nội tuyến của cùng phép toán ấy. Cổng này dùng lại đúng phép
toán đó, đặt tên riêng vì `index.html` **không nạp `shared.js`** (`index.html:9-11` — chỉ có
`auth.js`, xlsx, supabase-js; và `cloud-sync.js` ở cuối trang):

```js
/* Event names are user-editable, so every lookup here goes through this — the same
   normalisation shared.js calls evKey(). A gate that misses "Aerial Duel Success"
   because of a capital letter is worse than no gate: it reports a clean match. */
const anKey = e => String(e == null ? '' : e).trim().toLowerCase();
```

**Điều này cũng vá luôn lỗ hổng (b) ở §2** cho C6: cổng submit nhận diện `"Shot On Target"`,
trong khi `GOAL_SPOT_EVENTS.has()` lúc gõ thì không. Cổng submit **chặt hơn** cổng entry ở đúng
điểm này, và đó là điều đúng — nó là lưới cuối.

### 6.1 C1–C5 — đối ứng tranh chấp

#### 6.1.1 Bảng tra

```js
/* Every duel has two players in it, one from each side, so each of these has to be
   answered by its mirror on the other side. Read both ways round: one entry here
   produces two identities (a→b and b→a). */
const DUEL_MIRRORS = [
  { id:'aerial-mirror', label:'Aerial duels won ↔ lost',
    a:['aerial duel success'], b:['aerial duel fail'],
    aName:'won', bName:'lost' },
  { id:'ground-mirror', label:'Ground duels won ↔ lost',
    a:['ground duel success'], b:['ground duel fail'],
    aName:'won', bName:'lost' },
  /* 'take-on succes' is the spelling the shipped event list carries
     (pitchtagger_events.json:100) and the spelling EVENT_INC keys off
     (shared.js:203). Both are accepted here so a tagger who fixed the typo is not
     told their match is unbalanced — see the note in docs on EVENT_INC. */
  { id:'takeon-mirror', label:'Take-ons won ↔ take-on concerns',
    a:['take-on succes','take-on success'], b:['take-on concern'],
    aName:'won', bName:'concerns' }
];
const DUEL_TOTALS = [
  { id:'aerial-total', label:'Aerial duels — the same number on both sides',
    of:['aerial duel success','aerial duel fail'], from:'aerial-mirror' },
  { id:'ground-total', label:'Ground duels — the same number on both sides',
    of:['ground duel success','ground duel fail'], from:'ground-mirror' }
];
```

#### 6.1.2 Đếm

```js
/* One pass over the rows -> {home:{<key>:n}, away:{<key>:n}} for every event name
   the mirrors care about. Rows whose team is neither side are ignored: the DB
   constraint does not allow them, and inventing a third column here would only
   hide the day it does. */
function duelTally(rows){
  const want = new Set();
  DUEL_MIRRORS.forEach(m => m.a.concat(m.b).forEach(n => want.add(n)));
  const t = { home:{}, away:{} };
  (rows||[]).forEach(r => {
    const k = anKey(r.event);
    if(!want.has(k)) return;
    const side = t[r.team]; if(!side) return;
    side[k] = (side[k]||0) + 1;
  });
  return t;
}
const sumOf = (bucket, names) => names.reduce((n,k) => n + (bucket[k]||0), 0);
```

#### 6.1.3 Chấm

Mỗi `DUEL_MIRRORS` sinh **hai** đẳng thức, chấm độc lập, in cả hai kể cả khi một vế đúng — đọc
được nhiều hơn hẳn so với chỉ in vế sai:

```
✗ 2. Aerial duels won ↔ lost
     Home won 20   ≠  Away lost 18     — Away is short 2
     Home lost 14  =  Away won 14      ✓
```

`DUEL_TOTALS` sinh một đẳng thức, và khi trượt thì **trỏ về** mirror tương ứng:

```
✗ 1. Aerial duels — the same number on both sides
     Home 34  ≠  Away 32               — Away is short 2
     See check 2 for which half of the duel is missing.
```

#### 6.1.4 `take-on fail` cố ý **không** có vế đối ứng

Danh sách của bạn có `take-on success ↔ take-on concern`, và **không có gì** cho `take-on fail`.
Đó là đúng theo bóng đá: một pha đi bóng hỏng được ghi nhận bên phòng ngự bằng một
`tackle success`, một `ground duel success`, một `interception` hay chẳng bằng gì cả — không có
một event nào là "vế đối ứng" của nó. Ép một đẳng thức cho `take-on fail` sẽ khiến những trận
tag đúng bị chặn.

Ghi thẳng vào code, kèm test khoá lại (§17, T-C5b), để người sau không "bổ sung cho đủ bộ":

```js
/* take-on fail has NO mirror, on purpose. A beaten take-on is answered by whatever the
   defender actually did — a tackle, a ground duel, an interception, or nothing at all.
   Adding an identity for it would refuse matches that are tagged correctly. */
```

#### 6.1.5 Không chia theo hiệp, không chia theo cầu thủ

Yêu cầu là đẳng thức **toàn trận**. Chia theo hiệp sẽ chặn một trường hợp hợp lệ: pha tranh chấp
đúng vào lằn ranh giao giữa hai hiệp, hai vế rơi hai bên `h2Start`. Con số theo hiệp vẫn được
tính, nhưng chỉ dùng làm **gợi ý không chặn** (§12).

### 6.2 C6 — shot on target phải có vị trí trong khung thành

```js
/* The spot the ball crossed the line at. Stored normalised to the mouth: x 0 = left
   post -> 100 = right post, y 0 = crossbar -> 100 = the goal line (index.html:1243).
   A goal is on target by definition and openGoalCapture() already holds one back for a
   spot, so the gate covers the same two events the capture does — otherwise the gate
   would be looser than the UI it is backing up. */
const SPOT_REQUIRED = new Set(['shot on target','goal']);
const inMouth = g => g && typeof g.x === 'number' && typeof g.y === 'number'
  && g.x >= 0 && g.x <= 100 && g.y >= 0 && g.y <= 100;

function checkShotSpots(rows, dur){
  const bad = [];
  (rows||[]).forEach(r => {
    if(!SPOT_REQUIRED.has(anKey(r.event))) return;
    if(inMouth(r.gXY)) return;
    bad.push({ t:r.t, team:r.team, no:String(r.playerFrom||'').trim(),
               event:r.event, rowId:r.id,
               why: r.gXY ? 'outside the goal frame' : 'no spot was placed' });
  });
  return bad.sort((x,y) => x.t - y.t);
}
```

**Vì sao gộp cả `goal`:** `GOAL_SPOT_EVENTS` (`index.html:1248`) đã gồm hai event này, và
`submitEntry():2379` ghi `gXY` cho cả hai. Nếu cổng chỉ soi `shot on target`, một bàn thắng
thiếu vị trí vẫn lọt — trong khi chính app đã coi nó là bắt buộc. Cổng lỏng hơn UI mà nó bảo vệ
là một cổng vô nghĩa. Xem **Q2** (§19) nếu bạn muốn thu hẹp đúng chữ.

**Vì sao kiểm cả khoảng giá trị:** `goalFromPct()` (`index.html:1294`) đã kẹp về `[0,100]`, nên
qua UI thì không thể sai. Nhưng `gXY` đến từ `dbToRow()` (`cloud-sync.js:60`), tức từ cột
`goal_x/goal_y` trong DB — một dòng sửa tay hoặc nhập từ nguồn khác có thể nằm ngoài khung.
Chi phí kiểm: hai phép so sánh.

**Vì sao không tự mở khung thành để sửa:** vì đây là màn Submit, không phải màn tag; và vì sửa
được thì phải sửa cả `state.rows` lẫn DB. Thông báo chỉ đúng phút, Analyst quay ra bảng event,
bấm `✎ Edit` — luồng có sẵn, `submitEntry()` đã biết đặt lại quả bóng vào chỗ cũ
(`index.html:2321-2324`). §10.3 bàn phương án bấm-để-nhảy.

### 6.3 C7 — số áo đúng với formation tại đúng thời điểm

#### 6.3.1 Hai tầng, y hệt cổng entry

Cổng này **phải** dùng đúng hai tầng của `checkEntryNumbers()`, nếu không hai cổng sẽ mâu thuẫn
nhau — một entry được cho qua lúc gõ rồi bị chặn lúc publish mà không có gì thay đổi giữa hai
lần, đó là kiểu lỗi khiến người dùng mất lòng tin vào cả hai cổng.

| Tầng | Luật | Ngoại lệ |
|---|---|---|
| 1 — SQUAD | số áo ∈ `XI(t) ∪ Bench(t)` của **chính đội đó** | không có |
| 2 — ON PITCH | số áo ∈ `XI(t)` | `OFF_PITCH_OK` = {substitution, yellow card, red card} (`index.html:2454`) |

Và như cổng entry: **chỉ đọc bảng của đội sở hữu dòng đó**. Số áo mà đội kia có không phải là
trường hợp đặc biệt — nó chỉ đơn giản là một số mà đội này không có.

#### 6.3.2 Mỗi dòng có thời điểm của riêng nó

`squadAt(team, t)` gọi `effectiveLU(team, t)`, hàm này lọc `history` theo `h.t <= t`
(`index.html:2433`) — tập số áo hợp lệ là một **hàm bậc thang theo thời gian**. Cổng hỏi hàm ấy
**một lần cho mỗi dòng**, tại `r.t` của chính dòng đó, không phải một lần cho cả trận.

Một entry chuỗi (`grp`) được `submitEntry()` tách thành nhiều dòng, mỗi dòng mang thời điểm của
dot riêng nó (`index.html:2371`) — nên "mỗi dòng, thời điểm của nó" là đúng độ hạt.

#### 6.3.3 ⚠ Cạm bẫy: thẻ đỏ tự làm chính nó sai

**Đây là chỗ một bản cài đặt ngây thơ sẽ hỏng, và nó sẽ hỏng ở *mọi* trận có thẻ đỏ.**

`applyRedCard(team, no, t)` (`index.html:2738-2757`) đẩy vào history một snapshot **tại đúng `t`**,
trong đó cầu thủ bị đuổi đã bị gỡ khỏi XI và **cố ý không** được thả xuống ghế dự bị
(`index.html:2745`). `effectiveLU` lọc `h.t <= t`, tức là **tại đúng `t`**, snapshot ấy đã có hiệu lực.

Cho nên nếu hỏi thẳng `squadAt('home', r.t)` cho chính dòng thẻ đỏ:

```
r = { t: 4025, team:'home', event:'red card', playerFrom:'6' }
squadAt('home', 4025).all  →  không chứa '6'
⇒ cổng báo:  "No.6 was sent off at 67:05 and is not on the pitch at 67:05"
```

Cổng vừa từ chối **chính cái dòng đã tạo ra tình trạng ấy**. Trận nào có thẻ đỏ cũng không
publish được, và thông báo thì vô nghĩa.

Cổng entry không gặp lỗi này vì hai lý do đã có sẵn: (1) lúc gõ, `applyRedCard` chạy **sau**
cổng (`index.html:2411` vs `:2295`), snapshot chưa tồn tại; (2) khi **sửa lại** một dòng thẻ đỏ,
`gateHistory()` (`index.html:2480`) gỡ dấu chân của chính dòng ấy ra trước khi phán xét.

**Lời giải: đúng nguyên tắc của `gateHistory()`, chuyển sang thuần.** Mỗi dòng được phán xét trên
tấm bảng **như nó vốn có trước khi chính dòng ấy làm nó đổi**:

```js
/* The board a row is judged against is the board WITHOUT that row's own footprint.
   A red card puts a snapshot at exactly its own t which removes the carded man from the
   board altogether — ask effectiveLU() at that t and he looks like a number the side
   never had, so the gate would refuse every red card in every match. gateHistory()
   already solves this for a row being re-edited (index.html:2480); this is the same rule,
   made pure and applied to every row.

   The matching rules and the ±3s window are lifted from subSideEffects (index.html:2680)
   and redSideEffects (index.html:2764) so the two can never drift apart: a snapshot's t
   comes from the pair's dot, the row's t from its own, and they are not bit-identical. */
const SNAP_WINDOW = 3;
function histWithoutRow(hist, row){
  const ev = anKey(row.event);
  if(ev !== 'red card' && ev !== 'substitution') return hist;
  return (hist||[]).filter(h => {
    if(h.team !== row.team || Math.abs(h.t - row.t) > SNAP_WINDOW) return true;
    if(ev === 'red card')
      return !(h.off != null && numEq(h.off, row.playerFrom));
    return !/^Substitution/.test(h.label || '');
  });
}
```

Vì sao gỡ cả snapshot của `substitution`, dù nó **không** gây lỗi (người ra sân xuống ghế, vẫn
thuộc tầng 1; `substitution` lại nằm trong `OFF_PITCH_OK` nên tầng 2 không áp)? Vì tính đối
xứng: luật đọc thành **một câu duy nhất** — *"phán xét mỗi dòng trên tấm bảng ngay trước khi
chính nó thay đổi tấm bảng"* — thay vì "phán xét trên bảng hiện thời, trừ thẻ đỏ thì...". Một
luật không có ngoại lệ thì không có ngoại lệ nào bị bỏ sót. Bất biến **I5** (§13) khoá điều này.

#### 6.3.4 Thuật toán

```js
/* -> the offending (row, number) pairs, in time order. Empty means C7 holds.
   Pure: lineups and dur come in, nothing is read off `state`. */
function checkShirtNumbers(lineups, rows, dur){
  if(!lineups || !lineups.home || !lineups.away) return null;   // -> the no-lineup verdict
  const hist0 = lineups.history || [];
  const bad = [];
  (rows||[]).forEach(r => {
    const lu = lineups[r.team]; if(!lu) return;
    const ev = anKey(r.event);
    const hist = histWithoutRow(hist0, r);
    const sq = squadIn(lineups, r.team, r.t, hist);   // pure twin of squadAt()
    // an entry with no board at all is the same verdict the entry gate gives
    if(!sq.on.length){ bad.push({ kind:'no-board', t:r.t, team:r.team, rowId:r.id,
                                  event:r.event, no:null }); return; }
    [r.playerFrom, r.playerTo].forEach(raw => {
      const no = String(raw == null ? '' : raw).trim();
      if(!no) return;                                  // nothing claimed, nothing to check
      if(!sq.all.includes(no)){
        const red = hist.filter(h => h.team === r.team && h.off != null
                    && numEq(h.off, no) && h.t <= r.t).sort((a,b) => a.t - b.t).pop();
        bad.push({ kind: red ? 'sent-off' : 'unknown', redT: red ? red.t : null,
                   t:r.t, team:r.team, no, event:r.event, rowId:r.id, sq });
        return;
      }
      if(!sq.on.includes(no) && !OFF_PITCH_OK.has(ev))
        bad.push({ kind:'bench', t:r.t, team:r.team, no, event:r.event, rowId:r.id, sq });
    });
  });
  return bad.sort((a,b) => a.t - b.t);
}
```

`squadIn(lineups, team, t, hist)` là bản thuần của `squadAt()` (`index.html:2459`): cùng phép
toán, nhưng `lineups` truyền vào thay vì đọc `state.lineups`. §16 nêu cách tránh chép đôi.

**`OFF_PITCH_OK.has(ev)`** — chú ý `ev` đã qua `anKey`, còn `OFF_PITCH_OK` chứa chuỗi thường.
Cổng entry gọi `OFF_PITCH_OK.has(s.ev)` với tên **thô** (`index.html:2528`); ở đây chuẩn hoá
trước là **chặt hơn theo hướng an toàn**: một event tên `"Substitution"` sẽ được miễn tầng 2
(đúng), thay vì bị đòi phải có mặt trên sân (sai).

#### 6.3.5 Ranh giới: **không** phán xét lại chiều của một cặp sub

`planSubGroup()` (`index.html:2587`) đã vét chuyện "ai ra ai vào", đã tự đảo cặp gõ ngược, và
snapshot nó sinh ra **chính là** định nghĩa của formation từ đó về sau. Dựng lại việc đó ở cổng
submit đồng nghĩa với chạy lại toàn bộ `planSubGroup` trên payload — nhiều code, và khi hai bản
lệch nhau thì cái sai là bản mới, chứ không phải dữ liệu.

Cổng chỉ hỏi câu nó có thẩm quyền hỏi: *số áo này, đội này có tại thời điểm này không.*

### 6.4 Bảng tóm tắt bảy điều kiện

| # | Dữ liệu cần | Thuần? | Chỉ ra thời điểm? |
|---|---|---|---|
| C1 | `rows` | ✔ | không (tổng toàn trận) |
| C2 | `rows` | ✔ | không — nhưng có gợi ý §12 |
| C3 | `rows` | ✔ | không |
| C4 | `rows` | ✔ | không — gợi ý §12 |
| C5 | `rows` | ✔ | không — gợi ý §12 |
| C6 | `rows`, `dur` | ✔ | **có** — mỗi cú sút một dòng |
| C7 | `rows`, `lineups`, `dur` | ✔ | **có** — mỗi số áo một dòng |

---

## 7. Đồng hồ: một thời điểm, một cách đọc

Thông báo lỗi C6/C7 phải in **phút theo timeline trận đấu**, và phút ấy phải **khớp tuyệt đối**
với phút mà bảng event đang hiện — nếu không, Analyst đi tìm dòng ở phút 67 trong khi bảng ghi
phút 22, và cổng trở thành thứ gây bực chứ không phải thứ giúp việc.

Ba hàm đang tính chuyện đó, cả ba đọc thẳng `state.duration`:

| Hàm | Dòng | Việc |
|---|---|---|
| `eventHalf(r)` | `1393` | hiệp 1 hay 2 |
| `matchTime(vt)` | `1406` | giờ video → giây đồng hồ trận |
| `matchClockParts(vt)` | `1415` | tách bù giờ: `45:00 +01:05.36` |
| `fmtMatchClock(vt)` | `1429` | chuỗi cho thanh công cụ |

Cổng cần đúng phép toán ấy nhưng với **`payload.dur`**, không phải `state.duration` (§5, hệ quả 2).

### 7.1 Đề xuất: **tách hàm thuần, không chép**

```js
// index.html — the three helpers grow a `dur` parameter; the existing names delegate.
function eventHalfIn(dur, t){ const h2 = dur.h2Start; return (h2 > 0 && t >= h2) ? 2 : 1; }
function matchTimeIn(dur, vt){
  if(!dur.enabled) return vt;
  const off = (+dur.halfLen || 45) * 60;
  if(dur.h2Start > 0 && vt >= dur.h2Start) return off + (vt - dur.h2Start);
  return Math.max(0, vt - (dur.h1Start || 0));
}
function matchClockPartsIn(dur, vt){ …the body of matchClockParts, reading `dur`… }
function fmtMatchClockIn(dur, vt){
  const p = matchClockPartsIn(dur, vt); return p ? p.base + ' ' + p.extra : fmt(matchTimeIn(dur, vt));
}
// unchanged for every existing caller
function eventHalf(r){ return eventHalfIn(state.duration, r.t); }
function matchTime(vt){ return matchTimeIn(state.duration, vt); }
function matchClockParts(vt){ return matchClockPartsIn(state.duration, vt); }
function fmtMatchClock(vt){ return fmtMatchClockIn(state.duration, vt); }
```

Rồi dấu thời gian của cổng:

```js
/* "H2 67:40" — the half and the clock, the two things needed to find the row in the
   events table. Stoppage time reads the way the toolbar reads it: "H1 45:00 +01:12.40". */
const anStamp = (dur, t) => 'H' + eventHalfIn(dur, t) + ' ' + fmtMatchClockIn(dur, t);
```

### 7.2 Vì sao tách chứ không chép tám dòng

Chép thì không phải đụng vào hàm đang chạy, nhưng hai bản sẽ **trôi** — và ngày chúng trôi,
triệu chứng là *cổng chỉ sai phút*, thứ không test nào bắt và không ai ngờ tới. Tách ra thì
"event này ở phút mấy" có đúng một câu trả lời trong cả file.

**Cái giá phải trả, nói trước:** `tests/harness.js:78` nạp `matchTime`, `eventHalf` vào sandbox
theo **tên**. Sau khi tách, thân của chúng gọi `matchTimeIn`/`eventHalfIn` — **không nạp các
tên mới vào `FUNCS` thì mọi test đang dùng `matchTime` sẽ ném `ReferenceError`**. Đây là thao
tác bắt buộc, không phải tuỳ chọn. §15 liệt kê đủ.

---

## 8. API: `checkAnalysis(payload)`

```js
/* -> { ok, checks:[ {id, n, label, ok, lines:[…], spots:[…]} ], hints:[…] }
   `lines`  — plain-text lines describing the verdict (always present, pass or fail)
   `spots`  — the moments to go and look at: {stamp, team, no, event, why, rowId}
   `hints`  — never blocks; see §12
   Pure. The only input is the payload buildReport() produced, and the only output is
   a description of it. Nothing here reads the DOM, `state`, or the video. */
function checkAnalysis(payload){
  const rows = (payload && payload.rows) || [];
  const dur  = Object.assign({enabled:false, halfLen:45, h1Start:0, h1End:0, h2Start:0, h2End:0},
                             (payload && payload.dur) || {});
  const lineups = payload && payload.lineups;
  const T = duelTally(rows);
  const checks = [];
  DUEL_TOTALS.forEach(d  => checks.push(totalCheck(d, T)));       // C1, C3
  DUEL_MIRRORS.forEach(d => checks.push(mirrorCheck(d, T)));      // C2, C4, C5
  checks.push(spotCheck(checkShotSpots(rows, dur), dur));         // C6
  checks.push(shirtCheck(checkShirtNumbers(lineups, rows, dur), dur, !!lineups)); // C7
  const ordered = ORDER.map(id => checks.find(c => c.id === id));  // C1..C7, the order you gave
  ordered.forEach((c,i) => c.n = i + 1);
  return { ok: ordered.every(c => c.ok), checks: ordered, hints: duelHints(rows, dur) };
}
const ORDER = ['aerial-total','aerial-mirror','ground-total','ground-mirror',
               'takeon-mirror','shot-spot','shirt-numbers'];
```

**Cả bảy luôn được chấm — không dừng sớm.** Analyst phải thấy toàn cảnh trong một lần mở hộp
thoại, chứ không phải sửa-chạy-lại bảy vòng. Bất biến **I6** (§13).

**Giới hạn danh sách:** `spots` giữ đầy đủ trong dữ liệu, nhưng phần hiển thị cắt ở
`AN_SPOT_MAX = 12` mỗi điều kiện, kèm dòng `…and 7 more`. Một trận tag hỏng có thể sinh hàng
trăm dòng, và một hộp thoại dài 300 dòng thì không ai đọc.

---

## 9. Chèn vào luồng Submit

### 9.1 Hai chỗ, hai vai

| Chỗ | Vai | Hậu quả khi trượt |
|---|---|---|
| `submitBtn.onclick` (`:3686`) — lúc **mở** hộp thoại | **Bản báo cáo tiền chuyến bay.** Chấm bảy điều kiện, vẽ bảng, tắt nút `Publish` | không publish được, và biết vì sao |
| bên trong `publishReport()` — lúc **bấm** Publish | **Cổng thật.** Chấm lại trên đúng payload sắp ghi | ném lỗi, RPC không chạy |

Vì sao cần cả hai: giữa lúc mở hộp thoại và lúc bấm Publish, dữ liệu **có thể đổi** — realtime
sync từ tab khác, hoặc chính Analyst mở hộp thoại rồi quay ra sửa vài dòng. Chỉ có cái chấm
**sát ngay trước RPC** mới là cổng; cái chấm lúc mở là thông tin.

### 9.2 Phương án B (đề xuất): truyền `gate` xuống `publishReport`

Vấn đề: `publishReport()` **tự gọi lại** `buildReport()` bên trong (`cloud-sync.js:476`). Nên
nếu `submitGo` tự build rồi tự chấm rồi mới gọi `publishReport`, thứ được chấm và thứ được ghi
là **hai lần build khác nhau** — cộng thêm một vòng mạng thừa.

`cloud-sync.js`, đúng ba dòng:

```js
/* The gate is the caller's: cloud-sync moves a payload, it does not know what a fair
   aerial duel count looks like. It is applied HERE and not in the dialog so that what is
   judged and what is written are the same build — see the note above fetchAllEvents on
   why a report that is subtly short is the worst kind to publish. */
async function publishReport(clubId, gate) {
  const built = await buildReport();
  if (gate) { const stop = gate(built.payload); if (stop) throw new Error(stop); }
  const { data, error } = await sb.rpc('publish_match_report', { … });   // unchanged
  …
}
```

`index.html`:

```js
$('submitGo').onclick = async () => {
  …
  const r = await Cloud.publishReport(id, p => {
    const v = checkAnalysis(p);
    renderAnalysisChecks(v);                        // the panel updates with the fresh verdict
    return v.ok ? null : analysisRefusal(v);        // a string = refuse, null = go
  });
  …
};
```

`Cloud.publishReport` giữ nguyên chữ ký cũ khi không truyền `gate` (`gate` là `undefined` ⇒ bỏ
qua) — không có caller nào khác trong repo, nhưng giữ tương thích thì không tốn gì.

**Cái giá:** đụng `cloud-sync.js` ⇒ `index.html:3742` `?v=48` → `?v=49`, và
`node tests/asset-versions.test.js --update`. `tests/asset-versions.json` có `cloud-sync.js`
với `v:48` + hash; đổi file mà quên bump là test **đỏ ngay**, kèm đúng câu chỉ chỗ phải sửa.

### 9.3 Phương án A (thay thế): không đụng `cloud-sync.js`

```js
$('submitGo').onclick = async () => {
  const built = await Cloud.buildReport();          // build lần 1
  const v = checkAnalysis(built.payload);
  if(!v.ok){ renderAnalysisChecks(v); say('submitMsg', analysisRefusal(v), true); return; }
  const r = await Cloud.publishReport(id);          // build lần 2 — có thể đã khác
  …
};
```

Không cache-bust, nhưng có **khe hở TOCTOU**: giữa hai lần build, một dòng từ tab khác có thể
rơi vào. Khe hở nhỏ (vài trăm ms) và cùng loại với khe hở mà kiểm tra `short` đang chấp nhận —
nhưng nó **là** khe hở, và nó nằm ở đúng chỗ không nên có.

**Đề xuất B.** Xem **Q1** (§19).

### 9.4 Thứ tự các chốt trong `submitBtn.onclick`

Chốt hiện có đứng trước, chốt mới đứng sau — vì trả lời được "trận này có bảy điều kiện nào
trượt" chỉ có nghĩa khi payload đã là payload thật:

```
1. chưa kết nối / chưa mở trận   -> dừng, như hiện nay            (:3691)
2. không có kênh nào             -> dừng, như hiện nay            (:3698)
3. buildReport()                                                   (:3705)
4. DB đang chậm hơn tab (`short`) -> cảnh báo + tắt Publish, như hiện nay (:3710)
5. ⟵ MỚI: checkAnalysis(payload) -> vẽ bảng bảy dòng
6. $('submitGo').disabled = short || !verdict.ok
```

Chốt 4 đứng **trước** chốt 5 có chủ đích: khi DB còn thiếu event, các con số tranh chấp **đằng
nào cũng lệch**, và bảo Analyst đi tìm 3 pha không chiến thiếu trong khi vấn đề là sync chưa
xong là chỉ sai đường. Khi `short` bật, bảng bảy dòng vẫn vẽ nhưng gắn một dòng đầu:

```
The database is still behind this tab — these numbers are counted from what it holds
today, and some of them will change once the sync finishes.
```

---

## 10. Giao diện

### 10.1 Vì sao **không** dùng `alert()`

Cổng entry dùng `alert()` (`entry-number-gate-design.md` §6.1) vì nó phải **cắt ngang** dòng gõ:
một dòng chữ trong panel sẽ bị lướt qua trong lúc mắt đang dán vào băng hình.

Cổng này thì ngược lại. Analyst **đang đứng trong một modal**, không gõ gì cả, và thứ họ cần là
một danh sách **đọc được, ở lại trên màn hình, đối chiếu được** trong lúc quay ra bảng event.
`alert()` biến mất ngay khi bấm OK và không chứa nổi 12 dòng có cấu trúc. Kết luận: **vẽ vào
modal.**

### 10.2 Markup

Thêm đúng một nút vào modal `#submitModal` (`index.html:588-603`), giữa `#submitCount` và
`#submitGo`:

```html
<div class="an-checks" id="submitChecks"></div>
```

CSS (nội tuyến trong `<style>` của `index.html`, cùng chỗ với phần Submit Analysis ở `:3672`):

```css
.an-checks{margin-top:10px;font-size:12px;line-height:1.65;max-height:46vh;overflow:auto}
.an-row{padding:4px 0;border-top:1px solid var(--line)}
.an-row:first-child{border-top:0}
.an-ok  .an-mark{color:#39d98a}          /* the same green Stats uses for "won" */
.an-bad .an-mark{color:var(--danger)}
.an-mark{font-weight:700;margin-right:6px}
.an-detail{color:var(--mut);padding-left:20px;white-space:pre-wrap}
.an-spot{color:var(--mut);padding-left:20px;font-variant-numeric:tabular-nums}
.an-spot b{color:var(--ink);font-weight:600}
.an-more{color:var(--mut);padding-left:20px;font-style:italic}
```

`#39d98a` là màu "won" mà `Stats/stats-view.js:177-178` đang dùng cho chính các thanh tranh chấp
này — dùng lại thì bảng kiểm và biểu đồ nói cùng một thứ tiếng. `:root` không có biến `--ok`
(`index.html:20-24`), và tài liệu thiết kế màu ở `:18` nói rõ xanh/đỏ "thắng vs thua" **cố ý**
để nguyên, không đưa vào chrome.

### 10.3 Hình dạng

```
Analysis checks — 5 of 7 passed.  Publishing is blocked until all seven pass.

✓ 1. Aerial duels — the same number on both sides            Home 34   Away 34
✗ 2. Aerial duels won ↔ lost
       Home won 20   ≠  Away lost 18      Away is short 2
       Home lost 14  =  Away won 14
✓ 3. Ground duels — the same number on both sides            Home 51   Away 51
✓ 4. Ground duels won ↔ lost
✓ 5. Take-ons won ↔ take-on concerns                         Home 12/9   Away 9/12
✗ 6. Shot on target has a spot in the goal mouth             2 shots
       H1 23:14   Home  No.9    shot on target   — no spot was placed
       H2 67:40   Away  No.11   goal             — no spot was placed
✗ 7. Shirt numbers were on the pitch at the time             3 events
       H2 62:10   Home  No.21   #recovery      — on the bench at 62:10
       H2 79:33   Away  No.4    #pass success  — sent off at 71:05
       H1 12:00   Home  No.99   #foul          — not in Home's formation
```

**Điều kiện đạt vẫn hiện.** Bảng bảy dòng ✓/✗ là thứ trả lời được câu "trận này đã sạch chưa" —
chỉ in lỗi thì Analyst không bao giờ biết cổng có thực sự chạy hay không.

**Bấm để nhảy (đề xuất Phase 2).** Mỗi dòng `.an-spot` mang `data-row="<rowId>"`; bấm vào thì
đóng modal, đặt `scrollToRow`, gọi `renderTable()` và tua video tới `videoTimeFromMatch()`. Cả
ba mảnh đã có sẵn (`index.html:2391`, `:1431`). Không đưa vào Phase 1 để cổng lên trước, nhưng
đây là thứ biến cổng từ "báo lỗi" thành "dẫn tới chỗ sửa". Xem §20.

---

## 11. Bảng thông điệp (tiếng Anh, như luật của repo)

| Tình huống | Chuỗi |
|---|---|
| Tiêu đề, đạt hết | `Analysis checks — all seven passed.` |
| Tiêu đề, còn trượt | `Analysis checks — 5 of 7 passed.  Publishing is blocked until all seven pass.` |
| DB còn chậm hơn tab | `The database is still behind this tab — these numbers are counted from what it holds today, and some of them will change once the sync finishes.` |
| C1/C3 đạt | `Home 34   Away 34` |
| C1/C3 trượt | `Home 34  ≠  Away 32      Away is short 2` + `See check 2 for which half of the duel is missing.` |
| C2/C4/C5 một vế trượt | `Home won 20  ≠  Away lost 18      Away is short 2` |
| C2/C4/C5 vế kia đạt | `Home lost 14  =  Away won 14` |
| C6 đạt | `Every shot on target and every goal carries a spot.` |
| C6 trượt, đầu mục | `2 shots were stored without a spot in the goal mouth.` |
| C6, một dòng | `H1 23:14   Home  No.9   shot on target   — no spot was placed` |
| C6, ngoài khung | `H2 51:02   Away  No.7   shot on target   — the stored spot is outside the goal frame` |
| C7 đạt | `Every shirt number was one that side had, at the moment it was tagged.` |
| C7 trượt, đầu mục | `3 events name a shirt number the side did not have at that moment.` |
| C7 `bench` | `H2 62:10   Home  No.21   #recovery   — on the bench at 62:10, not on the pitch` |
| C7 `sent-off` | `H2 79:33   Away  No.4   #pass success   — sent off at 71:05` |
| C7 `unknown` | `H1 12:00   Home  No.99   #foul   — not in Home's formation` |
| C7 `no-board` | `H1 03:20   Away  No.7   #pass success   — Away has no line-up at this point in the match` |
| C7, cả trận không có line-up | `This match has no line-up saved, so no shirt number in it can be vouched for.` + `Open Player lists, then ⇪ Submit home and ⇪ Submit away.` |
| Cắt danh sách | `…and 7 more.` |
| Từ chối lúc bấm Publish | `Nothing was published — 2 of the seven analysis checks are still failing (aerial duels won ↔ lost; shirt numbers on the pitch).` |

Ghi chú về câu từ chối cuối: nó **liệt kê tên** các điều kiện đang trượt, chứ không nói suông
"kiểm tra thất bại" — đúng yêu cầu của bạn ("thông báo lỗi tại điều kiện nào"), và nó đọc được
kể cả khi bảng bên trên đã bị cuộn khuất.

---

## 12. Chẩn đoán không chặn: pha tranh chấp nào không có vế đối ứng

C1–C5 nói **có sai**, không nói **sai ở đâu**. Với một trận lệch 3 pha không chiến, Analyst
phải tự dò 34 pha để tìm 3. Phần này trả lời câu "đi đâu mà tìm" — và **không bao giờ chặn**.

```js
/* Pair each duel with the nearest opposite one on the other side within a window, greedily
   and in time order; whatever is left over is where the missing tag probably is.

   A HINT and never a verdict. The two halves of one duel are two separate entries, dotted
   at two slightly different video times, so any window is a guess — and a guess must never
   be able to stop a publish. The identities in C1..C5 are the rule; this only says where
   to look. */
const DUEL_PAIR_WINDOW = 5;       // seconds
```

Xuất ra dưới bảng, trong một khối `.an-detail` riêng, có nhãn `Where to look (a guess):`

```
Where to look (a guess) — 3 aerial duels on Home with nothing on Away nearby:
   H1 18:22   Home  No.5    aerial duel success
   H2 55:04   Home  No.5    aerial duel success
   H2 71:39   Home  No.14   aerial duel fail
```

Hai lý do phải gắn nhãn "a guess" thật rõ:

1. Cửa sổ ±5s là ước lượng. Một pha không chiến tag lệch 8 giây vẫn là một pha đúng.
2. Nếu Analyst tưởng đây là phán quyết, họ sẽ đi xoá những dòng đúng để "cho khớp" — làm hỏng
   dữ liệu bằng chính công cụ dựng ra để bảo vệ nó.

Số liệu chia theo hiệp cũng chỉ nằm ở đây, cùng lý do (§6.1.5).

---

## 13. Bất biến để tự kiểm

| # | Bất biến | Kiểm bằng |
|---|---|---|
| **I1** | Trượt bất kỳ điều kiện nào ⇒ `sb.rpc('publish_match_report')` **không chạy** | test đếm lời gọi rpc trên stub |
| **I2** | `checkAnalysis` **không ghi gì**: không `state`, không `localStorage`, không `Cloud.on*`, không DOM | quét source thân hàm; sandbox không cấp `state` |
| **I3** | Cái được chấm và cái được ghi là **cùng một** payload | `gate` chạy bên trong `publishReport`, sau `buildReport`, trước `rpc` (§9.2) |
| **I4** | Trượt ⇒ trận **không đổi trạng thái**: không version mới, `matches.club_id` không đổi | rpc là một transaction và nó không được gọi |
| **I5** | Mỗi dòng được phán xét trên bảng **trước** dấu chân của chính nó | test: trận có 1 thẻ đỏ ⇒ C7 đạt (§6.3.3) |
| **I6** | Cả bảy luôn được chấm, không dừng sớm | test: trận sai cả 7 ⇒ `checks.length === 7`, cả 7 `ok:false` |
| **I7** | C2 đạt ⇒ C1 đạt; C4 đạt ⇒ C3 đạt (§3.1) | test sinh số ngẫu nhiên, đối chiếu hai kết quả |
| **I8** | Tên event hoa/thường/thừa khoảng trắng **không** làm cổng bỏ sót | test: `"Aerial Duel Success"`, `" GOAL "` |
| **I9** | Phút cổng in ra = phút bảng event hiện | cùng dùng `eventHalfIn`/`fmtMatchClockIn` (§7) |
| **I10** | Cổng đọc `payload.dur`, không đọc `state.duration` | test: đặt hai giá trị khác nhau, kết quả theo payload |
| **I11** | Chỉ đọc bảng của đội sở hữu dòng — không bao giờ hỏi đội kia (kế thừa I11 của cổng entry) | test: số áo chỉ Away có, tag cho Home ⇒ vẫn `unknown`, thông báo không nhắc Away |

---

## 14. Trường hợp biên

| Tình huống | Hành vi |
|---|---|
| Trận 0 event | Bảy điều kiện đều đạt (0 = 0). Vẫn publish được — cảnh báo `0 events stored` hiện có đã nói đúng chuyện đó |
| Không có event tranh chấp nào | C1–C5 đạt. Không bịa ra "trận này chưa tag tranh chấp" — đó không phải luật bạn yêu cầu |
| `payload.lineups === null` | C7 trượt cứng (§5.1). C1–C6 vẫn chấm bình thường |
| Trận không bật `dur` (`enabled:false`) | `matchTimeIn` trả thẳng giờ video, `eventHalfIn` trả 1. Dấu thời gian đọc là `H1 12:34.00` — đúng thứ bảng event đang hiện |
| Bù giờ | `fmtMatchClockIn` cho `H1 45:00 +01:12.40` — cùng định dạng thanh công cụ |
| Dòng có `playerTo` (pass, cross, sub) | C7 kiểm **cả hai** số. Người nhận cũng phải có mặt |
| Dòng không có `playerFrom` | Bỏ qua ở C7 (không có gì để kiểm). Cổng entry đã đòi số áo cho hầu hết event; dòng cũ có thể không có |
| Chuỗi `grp` chứa 2 shot on target | Cả hai dòng mang cùng `gXY` (`index.html:2379`) ⇒ cả hai đạt C6 |
| `team` không phải home/away | Bỏ qua ở C1–C5, bỏ qua ở C7 (`lineups[r.team]` là `undefined`). DB có ràng buộc; bịa cột thứ ba ở đây chỉ che ngày nó vỡ |
| Thẻ đỏ ở đúng phút một event khác của cùng người | Cửa sổ `±3s` của `histWithoutRow` có thể gỡ nhầm snapshot cho dòng kia ⇒ nới lỏng, **không** chặt thêm. Sai theo hướng cho qua, đúng hướng an toàn |
| Hai thẻ đỏ cho cùng số áo | `applyRedCard` trả `false` lần hai (không còn trong XI) ⇒ chỉ một snapshot. C7 báo dòng thứ hai là `sent-off` — đúng |
| Người bị đuổi rồi lĩnh thêm thẻ vàng | `yellow card` ∈ `OFF_PITCH_OK` nhưng anh ta **không còn trong `all`** ⇒ báo `sent-off`. Giống hệt cổng entry (`index.html:2521`) |

---

## 15. Ảnh hưởng tới test hiện có

Nền: **885/885** → **937/937** sau khi làm. Ba test cũ phải đổi, và cả ba đổi vì chúng khoá
**hình dạng source** của đúng thứ vừa được đổi — ý định của cả ba vẫn đúng nguyên:

| File | Ảnh hưởng | Vì sao |
|---|---|---|
| `tests/harness.js` | **phải sửa** — thêm vào `FUNCS` | `matchTimeIn`, `eventHalfIn`, `matchClockPartsIn`, `fmtMatchClockIn` (§7.2 — **bỏ sót là `ReferenceError` ở mọi test dùng `matchTime`**), cùng `anKey`, `duelTally`, `histWithoutRow`, `squadIn`, `checkShotSpots`, `checkShirtNumbers`, `checkAnalysis`; và `CONSTS`: `DUEL_MIRRORS`, `DUEL_TOTALS`, `SPOT_REQUIRED`, `SNAP_WINDOW`, `DUEL_PAIR_WINDOW` |
| `tests/asset-versions.json` | **phải sửa** — `cloud-sync.js` `v:48` → `v:49` + hash mới | phương án B (§9.2). Chạy `node tests/asset-versions.test.js --update` |
| `index.html:3742` | **phải sửa** — `?v=48` → `?v=49` | cùng lý do |
| `tests/submit-analysis.test.js` | **2 test đã sửa** | (1) `publishing is one call…` bắt chữ ký `publishReport(clubId)`, không còn khớp khi thành `(clubId, gate)` — nới regex, hai `ok/notOk` bên trong giữ nguyên. (2) `it refuses to look ready…` bắt `disabled=short`, nay là `disabled=blocked`; thay bằng hai assertion, một trong đó khoá `const blocked=short||!verdict.ok` để chứng minh `short` **vẫn giữ quyền phủ quyết riêng** |
| `tests/duration-goto.test.js`, `period-time-edit.test.js`, `card-timeline.test.js` | **không đổi** nếu `FUNCS` được cập nhật | chúng gọi `matchTime`/`eventHalf` qua tên cũ, và tên cũ giữ nguyên hành vi |
| `tests/entry-numbers.test.js` | **1 test đã sửa** | T14c quét source `squadAt` để chứng minh cổng không với sang đội kia; thân hàm nay nằm ở `squadIn`, nên `squadIn` được thêm vào danh sách quét — nếu không, luật đang canh một căn phòng trống. `checkEntryNumbers` không bị đụng một ký tự |
| `tests/auth-gate.test.js` | **không đổi**, nhưng khoá | mọi chuỗi mới trong `index.html`/`cloud-sync.js` phải là tiếng Anh |
| Còn lại | **không đổi** | không đụng `shared.js`, `Stats/*`, `Player-Lists/*`, `client/*` |

**Nguyên tắc đã áp dụng cho cả ba:** một test khoá hình dạng source thì khi hình dạng đổi, thứ
phải kiểm lại là **ý định**, không phải chuỗi regex. Cả ba ý định đều còn nguyên — publish vẫn
là một lần ghi, sync chậm vẫn tự nó chặn nút, cổng vẫn không với sang đội kia — nên cả ba được
viết lại để tiếp tục khoá đúng những điều đó, chứ không được nới ra cho qua.

---

## 16. Vị trí code

| Mảnh | Đặt ở | Ghi chú |
|---|---|---|
| `eventHalfIn`, `matchTimeIn`, `matchClockPartsIn`, `fmtMatchClockIn` | `index.html`, ngay tại chỗ của các hàm cũ (`:1393`, `:1406`, `:1415`, `:1428`) | các tên cũ thành wrapper một dòng |
| `anKey`, `DUEL_MIRRORS`, `DUEL_TOTALS`, `SPOT_REQUIRED`, `duelTally`, `checkShotSpots` | khối mới **sau** `checkEntryNumbers`/`numberGateMessage` (≈ `:2570`) | ngay cạnh cổng entry: hai cổng đọc liền nhau |
| `squadIn`, `histWithoutRow`, `checkShirtNumbers` | cùng khối | `squadAt()` (`:2459`) rút gọn thành `squadAt = (team,t,h) => squadIn(state.lineups, team, t, h ?? state.lineups.history)` — **một** phép toán, hai lối vào |
| `checkAnalysis`, `analysisRefusal`, `anStamp` | cùng khối | biên công khai |
| `renderAnalysisChecks(v)` | trong IIFE Submit Analysis (`:3677`) | duy nhất mảnh chạm DOM |
| `div#submitChecks` | `index.html:598`, giữa `#submitCount` và `#submitGo` | |
| `.an-*` CSS | khối `<style>`, cạnh comment `/* ---- Submit Analysis ---- */` (`:3672`) | |
| `gate` param | `cloud-sync.js:475` | ba dòng, §9.2 |

**Về `squadAt`:** rút gọn nó thành wrapper của `squadIn` là điểm mấu chốt để hai cổng **không
thể** trôi khỏi nhau. Nếu chép đôi, một ngày nào đó cổng entry cho qua thứ cổng submit chặn, và
Analyst không có cách nào biết mình sai ở đâu. `tests/entry-numbers.test.js` đang khoá hành vi
của `squadAt` — nếu wrapper viết đúng, cả 28 test đó pass không sửa một dòng, và đó chính là
phép thử cho việc rút gọn.

---

## 17. Kế hoạch test — `tests/analysis-gate.test.js`

Tệp mới. `tests/submit-analysis.test.js` nói về **đường biên và đường truyền**; tệp này nói về
**luật nội dung**. Trộn vào nhau thì cả hai đều khó đọc.

Hàm dựng payload dùng chung:

```js
const P = (over) => Object.assign({
  schema:1, meta:{home:'Home',away:'Away'},
  lineups:{ home:LU(['1','2','3']), away:LU(['1','4','5']), history:[] },
  dur:{enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:3000,h2End:5700},
  rows:[]
}, over||{});
const ev=(team,no,name,t,extra)=>Object.assign({id:'r'+t+name,team,playerFrom:no,playerTo:'',
  event:name,t,gXY:null,grp:null},extra||{});
```

| # | Test | Khoá điều gì |
|---|---|---|
| **T-C1a** | 3 `ads` Home + 3 `adf` Away ⇒ C1, C2 đạt | ca cơ bản |
| **T-C1b** | 3 `ads` Home + 2 `adf` Away ⇒ C1 và C2 đều trượt, thông báo nói `Away is short 1` | |
| **T-C2a** | Home 2 `ads` 1 `adf`, Away 1 `ads` 2 `adf` ⇒ cả C1 và C2 đạt | |
| **T-C2b** | Home 2 `ads` 1 `adf`, Away 2 `ads` 1 `adf` ⇒ **C1 đạt, C2 trượt** | đúng cái tổng che được (§3.1) |
| **T-C2c** | in cả hai vế, kể cả vế đúng | §6.1.3 |
| **T-C3/C4** | như trên với ground duel | |
| **T-C5a** | Home 2 `take-on succes` ↔ Away 2 `take-on concern` ⇒ đạt | |
| **T-C5b** | Home 3 `take-on fail`, Away 0 gì cả ⇒ **cả bảy đạt** | `take-on fail` không có vế đối ứng (§6.1.4) |
| **T-C5c** | `'take-on success'` (viết đúng chính tả) tính như `'take-on succes'` | §6.1.1 |
| **T-C6a** | `shot on target` có `gXY:{x:50,y:50}` ⇒ đạt | |
| **T-C6b** | `shot on target` với `gXY:null` ⇒ trượt, `spots[0].stamp === 'H1 23:14'` | **thời điểm** |
| **T-C6c** | `goal` với `gXY:null` ⇒ trượt | §6.2 |
| **T-C6d** | `gXY:{x:140,y:50}` ⇒ trượt, lý do `outside the goal frame` | |
| **T-C6e** | `"Shot On Target"` với `gXY:null` ⇒ **vẫn trượt** | I8 — lỗ hổng (b) §2 |
| **T-C6f** | `shot off target`, `blocked shot` không cần spot ⇒ đạt | không nới rộng luật |
| **T-C7a** | mọi số áo trong XI ⇒ đạt | |
| **T-C7b** | số 99 không có trong đội hình ⇒ `unknown`, kèm `H1 12:00` | **thời điểm** |
| **T-C7c** | số dự bị, event `recovery`, chưa vào sân ⇒ `bench` | tầng 2 |
| **T-C7d** | số dự bị, event `yellow card` ⇒ **đạt** | `OFF_PITCH_OK` |
| **T-C7e** | sub ở 60:00, `recovery` ở 70:00 ⇒ đạt; **đổi sub sang 75:00** ⇒ trượt | §4.2 — lý do tồn tại của C7 |
| **T-C7f** | trận có 1 thẻ đỏ, mọi dòng khác hợp lệ ⇒ **C7 đạt** | **I5** — cạm bẫy §6.3.3 |
| **T-C7g** | dòng của người bị đuổi, sau thời điểm thẻ ⇒ `sent-off`, nêu phút lĩnh thẻ | |
| **T-C7h** | `pass success` với `playerTo` là số không có ⇒ trượt vào người nhận | |
| **T-C7i** | số chỉ Away có, tag cho Home ⇒ `unknown`, thông báo **không nhắc** Away | **I11** |
| **T-C7j** | `lineups:null` ⇒ C7 trượt, thông báo bảo đi Submit home/away | §5.1 |
| **T-C7k** | số áo có khoảng trắng thừa (`' 7 '`) khớp `'7'` | `numEq` |
| **T-G1** | cả bảy trượt ⇒ `checks.length===7`, cả bảy `ok:false` | **I6** |
| **T-G2** | payload 0 dòng ⇒ `ok:true` | §14 |
| **T-G3** | `checkAnalysis` không đụng `state`/`localStorage`/DOM | **I2** (quét source + sandbox trần) |
| **T-G4** | `dur` của payload khác `state.duration` ⇒ dấu thời gian theo payload | **I10** |
| **T-G5** | bù giờ ⇒ `H1 45:00 +01:12.40` | §7 |
| **T-G6** | `gate` trả chuỗi ⇒ `sb.rpc` **không được gọi** | **I1**, **I4** |
| **T-G7** | `gate` trả `null` ⇒ rpc chạy đúng một lần, `buildReport` chạy đúng một lần | **I3**, §9.2 |
| **T-G8** | `Cloud.publishReport(id)` không truyền `gate` ⇒ chạy như cũ | tương thích ngược |
| **T-G9** | nút `Publish` bị tắt khi có điều kiện trượt | §9.4 |
| **T-G10** | câu từ chối **liệt kê tên** các điều kiện trượt | §11 |
| **T-H1** | gợi ý ghép cặp **không bao giờ** làm `ok` thành `false` | §12 |

Đã viết **52 test**. Cùng với 885 hiện có ⇒ **937**. Ba trong số đó không đọc source mà **chạy thật** `publishReport` trên một database giả, để bất biến I1/I4 được chứng minh bằng hành vi chứ không bằng regex.

---

## 18. Rủi ro

### 18.1 Cổng chặt quá, trận đúng không publish được

Kịch bản thật: một brief chỉ yêu cầu tag **một đội**. Khi đó C1–C5 **không đời nào** đạt, và
trận đó vĩnh viễn không publish được.

Bạn đã nói rõ: *"Phải đáp ứng được các điều kiện trên thì mới có thể submit analysis thành công."*
Thiết kế theo đúng chữ đó: **không có lối thoát**. Nhưng rủi ro là thật, nên ghi vào đây, và
**Q4** (§19) mở sẵn cửa nếu bạn muốn một lối thoát có ghi vết (ví dụ: một ô tick kèm lý do, lý
do được nhét vào payload để CLB đọc được — cái nguy hiểm không phải là bỏ qua, mà là bỏ qua
lặng lẽ).

### 18.2 `EVENT_INC` khoá chặt lỗi chính tả `'take-on succes'`

`shared.js:203` và `pitchtagger_events.json:100` đều viết `'take-on succes'` (thiếu một `s`).
Nếu ai đó sửa tên event trong danh sách cho đúng chính tả, `EVENT_INC['take-on success']` là
`undefined` ⇒ cột `Take-ons Won` **âm thầm về 0** trong Stats, trong báo cáo PDF và trên site
CLB. Đúng lớp lỗi mà `tests/event-name-case.test.js` đã ghi nhận với `"throw-Ins"`.

Cổng này **nhận cả hai** cách viết (§6.1.1), nên nó không làm tình hình xấu đi — nhưng nó **soi
sáng** vấn đề: sau khi làm xong, cổng sẽ báo "cân bằng" trong khi Stats hiện 0. Đây là một lỗi
**có sẵn, độc lập**, nên sửa riêng: thêm `'take-on success':['takeOns','takeOnsWon']` vào
`EVENT_INC` (`shared.js:203` và bản trong `index.html:3222` lân cận), kèm bump `shared.js`
`?v=21` → `?v=22` trên **cả hai** trang nạp nó (`Player-Lists/index.html:98`,
`Stats/index.html:62`). **Ngoài phạm vi tài liệu này** — ghi lại để không rơi.

### 18.3 Cửa sổ `±3s` của `histWithoutRow`

Lấy từ `subSideEffects`/`redSideEffects` nên đã được thực chiến. Rủi ro: một thẻ đỏ và một event
khác của **cùng cầu thủ** cách nhau dưới 3 giây ⇒ có thể gỡ nhầm snapshot cho dòng kia, làm cổng
**cho qua** một dòng lẽ ra phải chặn. Sai theo hướng cho qua — đúng hướng. Chặt hơn (0s) sẽ làm
mọi thẻ đỏ bị từ chối trở lại (§6.3.3), tệ hơn nhiều.

### 18.4 Trận rất dài

C7 gọi `squadIn` một lần cho mỗi dòng, và mỗi lần lọc + sắp `history`. Với 3.000 dòng và 8
snapshot: 3.000 × 8 = 24.000 phép so sánh — dưới một mili-giây. Không cần cache. Nếu về sau
`history` phình lên (mỗi thay đổi formation một snapshot, cả trận), memo hoá theo
`(team, t làm tròn giây)` là bước tiếp theo — chưa cần bây giờ.

### 18.5 Cache-bust bị quên

Đúng cái bẫy `tests/asset-versions.test.js` được dựng lên để chặn, và nó **sẽ** chặn: đổi
`cloud-sync.js` mà không bump là test đỏ, kèm câu chỉ đúng trang phải sửa.

---

## 19. Các quyết định đã chốt

Cả năm chốt theo đề xuất (2026-08-15), và đều đã nằm trong code.

### ✅ Q1 — Cổng đặt ở đâu: trong `publishReport` (B) hay trong hộp thoại (A)? → **B**

- **A.** Chỉ sửa `index.html`. Không cache-bust. Có khe hở TOCTOU + một vòng mạng thừa.
- **B. (đề xuất)** Truyền `gate` xuống `publishReport`. Cái được chấm = cái được ghi, đúng một
  lần build. Giá: 3 dòng trong `cloud-sync.js`, bump `?v=48` → `?v=49`, và nới một regex trong
  `tests/submit-analysis.test.js`.

### ✅ Q2 — C6 có tính cả `goal` không? → **A: có**

- **A. (đề xuất)** Có. `GOAL_SPOT_EVENTS` đã gồm cả hai, `submitEntry` đã đòi spot cho cả hai;
  cổng lỏng hơn UI mà nó bảo vệ là cổng vô nghĩa.
- **B.** Chỉ đúng chữ `shot on target`. Bàn thắng thiếu vị trí sẽ lọt.

### ✅ Q3 — Không có line-up thì sao? → **A: C7 trượt cứng**

- **A. (đề xuất)** C7 trượt cứng. Nhất quán với `entry-number-gate-design.md` §5.1.
- **B.** Giữ cảnh báo suông như hiện nay, C7 bỏ qua. (Nhưng khi đó cổng nói "đạt" cho một trận
  không bảo chứng được số áo nào — thông điệp sai.)

### ✅ Q4 — Có lối thoát không? → **A: không**

- **A. (đề xuất, theo đúng chữ bạn viết)** Không. Bảy điều kiện là bảy điều kiện.
- **B.** Có, nhưng **có ghi vết**: ô tick + ô lý do bắt buộc, lý do được ghi vào payload để CLB
  đọc được. Dùng cho brief một-đội (§18.1).

### ✅ Q5 — Bấm vào dòng lỗi có nhảy tới event? → **A: Phase 2, chưa làm**

- **A. (đề xuất)** Phase 2. Cổng lên trước, điều hướng theo sau.
- **B.** Làm luôn Phase 1. Ba mảnh cần thiết đều có sẵn (§10.3).

---

## 20. Phân pha

| Pha | Nội dung | Test |
|---|---|---|
| **1** ✅ | `anKey`, `duelTally`, `DUEL_MIRRORS`/`DUEL_TOTALS`, C1–C5, `checkAnalysis` khung, bảng bảy dòng trong modal, tắt nút Publish | T-C1*, T-C2*, T-C3/4, T-C5*, T-G1, T-G2, T-G9 |
| **2** ✅ | Tách đồng hồ thuần (§7) + `FUNCS`, `SPOT_REQUIRED`, C6 kèm dấu thời gian | T-C6*, T-G4, T-G5 |
| **3** ✅ | `squadIn` (rút gọn `squadAt`), `histWithoutRow`, C7 kèm dấu thời gian | T-C7*, T-G3 |
| **4** ✅ | `gate` trong `publishReport`, cache-bust, câu từ chối lúc bấm Publish | T-G6, T-G7, T-G8, T-G10 |
| **5** ◐ | Gợi ý ghép cặp (§12) **đã làm**; bấm-để-nhảy (§10.3) hoãn sang Phase 2 theo Q5 | T-H1 |

Pha 1–4 là cổng, pha 5 là tiện ích. Cả năm đã làm trừ bấm-để-nhảy, và mỗi pha để lại một
`node tests/run.js` xanh.

---

## 21. Chốt lại một câu

**Cổng entry hỏi "con số này có thật không, ngay bây giờ"; cổng này hỏi "cả trận đấu này có tự
nhất quán không, ngay trước khi nó rời khỏi tay tôi" — bảy điều kiện, chấm hết cả bảy trong một
lần, chấm trên đúng cái payload sắp được ghi, và với hai điều kiện có thể chỉ được vào một khoảnh
khắc thì nó chỉ thẳng vào phút ấy.**
