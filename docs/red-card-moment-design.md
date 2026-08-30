# Khoảnh khắc thẻ đỏ — Cổng số áo C11 — Thiết kế chi tiết

**Một cầu thủ bị đuổi ở phút 60:58.72 thì tại **chính giây 60:58.72 đó** anh ta vẫn còn
trên sân. Cái lỗi dẫn đến thẻ, cái thẻ vàng thứ hai gây ra nó — tất cả đều được tag ở đúng
mốc thời gian ấy, và cổng `11. Shirt numbers were on the pitch at the time` đang từ chối
chúng bằng đúng câu vô nghĩa mà nó được viết ra để tránh:
`No.13  foul  — sent off at 60:58.72`.**

Trạng thái: **đã triển khai** (2026-08-30). **Q1→A** · **Q2→không** · **Q3→có** (làm cả
Giai đoạn 2) · **Q4→giữ tên** — bạn chốt cả bốn theo đề xuất, chi tiết ở §15.

Nối tiếp [`submit-analysis-gate-design.md`](submit-analysis-gate-design.md) (cổng lúc
**publish**, nơi C11 sống) và [`entry-number-gate-design.md`](entry-number-gate-design.md)
(cổng lúc **gõ entry**, §11 của tài liệu này).

> **Toàn bộ thay đổi mã nguồn nằm trong `index.html`** (+2 tên vào `tests/harness.js`,
> +8 test vào `tests/analysis-gate.test.js` và `tests/entry-numbers.test.js`).
> `shared.js` = 0 dòng · `cloud-sync.js` = 0 dòng · `Stats/*` = 0 dòng · `Player-Lists/*` = 0 dòng
> · `client/*` = 0 dòng · `worker/*` = 0 dòng · **không đổi schema, không migration, không cache-bust.**
> Không đụng tới bất kỳ tính năng nào khác — danh sách kiểm chứng đầy đủ ở §7.

> **Ràng buộc ngôn ngữ:** `tests/auth-gate.test.js` khoá `index.html` **không được có tiếng Việt**,
> kể cả trong comment. Mọi đoạn code và comment trong tài liệu này viết bằng tiếng Anh.
> Tài liệu nằm trong `docs/` nên không thuộc danh sách đó.

**Đã kiểm chứng thật, không phải suy đoán.** Trước khi viết tài liệu này, ca lỗi trên ảnh
chụp đã được dựng lại khớp từng ký tự, bản vá được áp thử, cả suite được chạy, rồi
**hoàn nguyên** — nên mọi con số dưới đây là đo được, không phải ước lượng. Sau khi bạn
chốt Q1–Q4, bản vá ấy được áp thật. Kết quả ghi ở §6 và §8.

| | Trước | Sau bản vá | Kèm test mới |
|---|---|---|---|
| `node tests/run.js` | **1401/1401** | **1401/1401** — *không sửa một test cũ nào* | **1409/1409** |
| Ca lỗi trên ảnh | `✗ 2 event(s) …` | `✓` | ghim ở `analysis-gate.test.js` |
| 18 ca biên ở §8 | 2 sai | **18/18 đúng** | 6 ca cốt lõi thành test |
| Cổng entry (§11) | `✗ sent off at 60:58.72` | `null` — nhận | ghim ở `entry-numbers.test.js` |

---

## 0. Tóm tắt

Luật hiện tại đọc bảng đội hình như sau: *"chấm mỗi dòng theo bảng đúng như nó đứng ngay
trước khi chính dòng đó làm nó thay đổi"* (`histWithoutRow`). Luật ấy đúng, nhưng **thiếu
một nửa**: một thẻ đỏ không phải do *dòng thẻ đỏ* gây ra — nó do **sự kiện** gây ra, và sự
kiện ấy gồm nhiều dòng cùng đứng ở **một mốc thời gian**.

Đề xuất bổ sung đúng nửa còn thiếu, phát biểu bằng **một câu**:

> ### **Một án phạt đuổi khỏi sân chỉ có hiệu lực SAU cái khoảnh khắc nó được rút ra, không phải tại chính khoảnh khắc đó.**

Cụ thể: khi chấm một dòng ở thời điểm `t`, bỏ qua những `formation period` thẻ đỏ **đang
đứng đúng tại `t`** của chính đội đó. Vì `effectiveLUIn` **chỉ bao giờ** đọc các period có
`h.t <= t`, một cửa sổ không với xa hơn chính `t` **không thể** đổi phán quyết của bất kỳ
dòng nào có thời gian khác thời gian thẻ. Đó là toàn bộ luận cứ "không regression" (§6).

**Kích thước:** 1 hằng số + 1 hàm 4 dòng + **sửa đúng 1 dòng** tại chỗ gọi.

---

## 1. Hiện tượng

Từ ảnh chụp bạn gửi (`Saint Lucia vs Barbados`, publish v4):

```
✗ 11. Shirt numbers were on the pitch at the time
      2 event(s) name a shirt number the side did not have at that moment.
      H2 60:58.72   Barbados  No.13   foul          — sent off at 60:58.72
      H2 60:58.72   Barbados  No.13   yellow card   — sent off at 60:58.72
```

Nút **Publish this match** bị khoá (`not ready`), và trận đấu **không đẩy sang client được**.

Đọc kỹ hai dòng đó: hệ thống nói *"No.13 bị đuổi lúc 60:58.72 nên không có mặt lúc
60:58.72"*. Đây chính là câu mà comment ở `index.html:3082` đã ghi rõ là **vô nghĩa** và
phải tránh — chỉ có điều nó đã tránh **muộn đúng một dòng**.

Ba dòng ấy sinh ra từ **một entry duy nhất** (`13f*yc*rc`): cú `*` gộp chúng vào **cùng một
dot**, nên cả ba mang **đúng cùng một `t`**. Dòng `red card` được miễn; hai dòng anh em của
nó thì không.

### 1.1 Dựng lại (đã chạy thật)

Dựng đúng bối cảnh: `h2Start = 3000`, thẻ ở `t = 3958.72` (= H2 60:58.72), Barbados có
No.13 trong XI, `lineups.history` mang một period `Red card: 13🟥` tại đúng `t` đó, và ba
dòng `foul` / `yellow card` / `red card` cùng `t`.

```
CURRENT  ok: false
    H2 60:58.72   Barbados  No.13   foul          — sent off at 60:58.72
    H2 60:58.72   Barbados  No.13   yellow card   — sent off at 60:58.72
```

Khớp **từng ký tự** với ảnh chụp. Ca lỗi đã được tái hiện.

---

## 2. Nguyên nhân gốc — chính xác ở dòng nào

### 2.1 Bảng đội hình là một hàm bậc thang, và bậc thang có hiệu lực **từ** `t`

`index.html:2765`

```js
function effectiveLUIn(lineups,team,t,hist0){
  const lu=lineups[team];
  const hist=(hist0||lineups.history||[]).filter(h=>h.team===team&&h.t<=t).sort((a,b)=>a.t-b.t);
  const last=hist[hist.length-1];
  ...
}
```

`h.t <= t` — **dấu bằng nằm ở đây**. Một period đặt tại `t` đã có hiệu lực **ngay tại** `t`.
Với substitution thì đó là cách đọc đúng. Với thẻ đỏ thì **không**: cái lỗi làm nên chiếc
thẻ xảy ra *trước* chiếc thẻ, dù đồng hồ ghi cùng một con số.

### 2.2 `applyRedCard` đặt period tại đúng `t` của dòng thẻ

`index.html:3391`

```js
function applyRedCard(team,no,t){
  ...
  xi.splice(i,1);                            // sent off: removed, and NOT added to the bench
  (state.lineups.history=state.lineups.history||[]).push({
    t, team, xi, subs:bench,
    off:String(no), offSpot,
    label:'Red card: '+no+'🟥'});
```

Người bị đuổi bị gỡ khỏi XI và **không** được đưa xuống ghế dự bị — nên với `squadIn`, anh
ta không nằm trong `on`, cũng không nằm trong `bench`, tức **không nằm trong `all`**. Anh ta
trông y hệt một số áo mà đội chưa bao giờ có.

### 2.3 Miếng vá hiện có — và chỗ nó dừng lại

`index.html:3090`

```js
function histWithoutRow(hist,row){
  const ev=anKey(row.event);
  if(ev!=='red card'&&ev!=='substitution')return hist||[];      // ← foul / yellow card thoát ra ở đây
  return (hist||[]).filter(h=>{
    if(h.team!==row.team||Math.abs(h.t-row.t)>SNAP_WINDOW)return true;
    if(ev==='red card')return !(h.off!=null&&numEq(h.off,row.playerFrom));
    return !/^Substitution/.test(h.label||'');
  });
}
```

Dòng `if(ev!=='red card'&&ev!=='substitution')return hist||[];` là **chính xác chỗ hỏng**.
`foul` và `yellow card` không phải `red card`, cũng không phải `substitution` → trả nguyên
`hist` → bị chấm trên bảng đã trống chỗ No.13.

Hàm này trả lời câu hỏi *"dòng này có tự tạo ra dấu chân của chính nó không?"*. Câu hỏi ấy
đúng nhưng **hẹp hơn thực tế**: dấu chân do **sự kiện** tạo ra, và sự kiện gồm 2–3 dòng.

### 2.4 Vì sao cổng lúc **gõ entry** không bắt được, mà cổng lúc **publish** thì bắt

Trong `submitEntry()`, thứ tự là: `checkEntryNumbers` chạy **trước** (`index.html:2624`),
`applyRedCard` chạy **sau** (`index.html:2740`). Lúc gõ `13f*yc*rc`, period thẻ đỏ **chưa
tồn tại**, nên cổng entry cho qua. Đến lúc `⇪ Submit Analysis`, period đã nằm trong
`matches.lineups` → C11 từ chối.

Đúng cái kịch bản mà `submit-analysis-gate-design.md` §4.2 gọi tên: *một dòng hợp lệ lúc gõ
vẫn có thể trở thành sai về sau*. Chỉ khác là lần này **dòng ấy chưa bao giờ sai** — luật
mới là thứ sai.

> §11 chỉ ra rằng cổng entry cũng có **đúng lỗi biên này**, chỉ đi vào bằng một cửa khác.

---

## 3. Nguyên tắc đề xuất

> **R1** (đã có, `histWithoutRow`, **giữ nguyên không đụng**) — một dòng không bị chấm bằng
> dấu chân của **chính nó**.
>
> **R2** (mới) — **một án phạt đuổi khỏi sân chưa có hiệu lực tại khoảnh khắc nó được rút ra.**

Hai luật, mỗi luật một câu, không có ngoại lệ nào bên trong. R2 **không thay thế** R1: R1
còn phải xử một ca mà R2 không với tới (period bị kéo giờ đi chỗ khác — xem §8/E17).

---

## 4. Ba phương án — và vì sao chọn A

| | **A · đúng khoảnh khắc** (đề xuất) | **B · ±`SNAP_WINDOW` (3 s)** | **C · theo `grp` (entry)** |
|---|---|---|---|
| Luật | bỏ period thẻ đỏ đứng tại `t` | bỏ period thẻ đỏ trong ±3 s | bỏ period của dòng cùng `grp` |
| Ca trên ảnh | ✅ | ✅ | ✅ |
| Sau thẻ 1 s vẫn bị chặn | ✅ | ❌ **thủng 3 giây** | ✅ |
| Cần dữ liệu ngoài `history` | không | không | **có** — phải dò `rows` tìm dòng thẻ |
| Entry 1 sự kiện (`grp = null`) | ✅ | ✅ | ❌ không phủ |
| Chứng minh không regression | **hình thức, §6** | không có | phải lý luận qua `grp` |
| Số dòng code | **~6** | ~6 | ~14 |

**B bị loại** vì nó tha bổng **3 giây thi đấu sau khi cầu thủ đã rời sân** — đúng cái mà
C11 tồn tại để bắt. `SNAP_WINDOW` trả lời một câu hỏi khác hẳn (*một period được phép nằm
xa dòng đã sinh ra nó bao nhiêu*, mà `fmEditPeriodTime` có thể nới ra); mượn nó sang đây là
lẫn hai khái niệm.

**C bị loại** vì nó phải đọc `rows` để tìm dòng thẻ đỏ, biến một hàm thuần trên `history`
thành một hàm phụ thuộc payload; và nó **không phủ** trường hợp `grp = null`
(`submitEntry:2691` — `const grpId=evs.length>1?newId():null`), tức entry một sự kiện.

**A được chọn.** Nó là phương án duy nhất có **chứng minh biên hình thức** (§6).

### 4.1 Vì sao cửa sổ là `0.01` chứ không phải `0`

`t_seconds` là `double precision` (`supabase/migrations/0001_init.sql:28`), còn
`lineups.history` đi trong JSONB — cùng một `double`, nên trên thực tế round-trip là chính
xác. Nhưng `===` trên số thực là thứ hỏng âm thầm. `0.01` là **độ chính xác mà bảng events
in ra** (`60:58.72`): hai dòng mà người tag **nhìn thấy là cùng một khoảnh khắc** thì bằng
nhau ở mức ấy. Chi phí: 10 mili-giây. Xem E3 ở §8 — `+0.02 s` vẫn bị chặn.

---

## 5. Thay đổi code

### 5.1 `index.html` — thêm 1 hằng số + 1 hàm

Chèn **ngay trước** `/* -> the offending (row, number) pairs in time order; …` (hiện ở
`index.html:3099`), tức ngay sau `histWithoutRow`:

```js
/* ---- the moment a card is shown belongs to the incident, not yet to the punishment ----
   A sending-off is the consequence of something tagged at the SAME instant: the foul that
   earned it, the second yellow that carried it. submitEntry writes those as separate rows
   of one entry ("13f*yc*rc") sharing one dot, so every one of them carries the card's own
   t -- and applyRedCard puts the snapshot at exactly that t, which effectiveLUIn reads as
   in force FROM t. Each sibling row of the incident is then judged against a board the
   incident itself emptied, and the check says the sentence histWithoutRow above exists to
   prevent, one row too early: "No.13  foul  -- sent off at 60:58.72".

   So the rule gains its missing half: a sending-off does not take effect until AFTER the
   moment it is shown. For a row at t, the red-card periods standing at t itself are
   dropped -- and dropping one can only ever put its own sent-off man back, because
   applyRedCard builds each of them as the board before it minus exactly that man.

   The window is a hundredth of a second and NOT SNAP_WINDOW, on purpose. effectiveLUIn
   only ever consults periods at or before t, so a window reaching no further than t
   itself cannot change the verdict of any row whose time differs from a card's: the whole
   of the rest of the match is judged by exactly the board it was judged by before.
   SNAP_WINDOW answers a different question -- how far a period may sit from the row that
   CREATED it, which fmEditPeriodTime can widen -- and borrowing it here would forgive
   three seconds of play after a sending-off. */
const SAME_MOMENT=0.01;                    // the precision the events table prints a time to
function histWithoutRedAtMoment(hist,row){
  return (hist||[]).filter(h=>!(h&&h.off!=null&&h.team===row.team
    &&Math.abs(h.t-row.t)<=SAME_MOMENT));
}
```

`h.off!=null` là thứ phân biệt period **thẻ đỏ** với period **thay người**: chỉ
`applyRedCard` mới ghi `off` (`index.html:3399`). Substitution **không bị đụng đến**.

### 5.2 `index.html` — sửa đúng **một** dòng

`checkShirtNumbers`, hiện ở `index.html:3107`:

```diff
-    const ev=anKey(r.event), hist=histWithoutRow(hist0,r);
+    const ev=anKey(r.event), hist=histWithoutRedAtMoment(histWithoutRow(hist0,r),r);
```

Ghép hàm chứ **không sửa `histWithoutRow`**: mỗi hàm giữ đúng một việc, và mọi test đang
khoá `histWithoutRow` tiếp tục đúng **từng byte**.

### 5.3 `tests/harness.js` — thêm 2 cái tên (bắt buộc)

Harness nhấc hàm ra khỏi `index.html` **theo tên**; thiếu tên thì `checkShirtNumbers` sẽ
`ReferenceError` trong sandbox.

```diff
-  'SNAP_WINDOW','DUEL_PAIR_WINDOW',
+  'SNAP_WINDOW','SAME_MOMENT','DUEL_PAIR_WINDOW',
```
```diff
-  'duelTally','totalCheck','mirrorCheck','checkShotSpots','histWithoutRow',
+  'duelTally','totalCheck','mirrorCheck','checkShotSpots','histWithoutRow','histWithoutRedAtMoment',
```

Chỉ **thêm**, không đổi thứ tự, không bỏ tên nào.

### 5.4 Những thứ **không** cần làm

| | Vì sao |
|---|---|
| Cache-bust `?v=` | Không đụng `shared.js` / `cloud-sync.js` / `Stats/*.js`. `index.html` là **trang**, không phải asset có `?v=`; nó không nằm trong `tests/asset-versions.json`. |
| `node tests/asset-versions.test.js --update` | Không file nào có version thay đổi. |
| Migration / schema | Không có cột mới, không đọc cột mới. |
| `deploy.yml` | Không có file mới. |
| Đổi hình dạng payload | `checkAnalysis` vẫn nhận đúng payload cũ, trả đúng shape cũ. |

---

## 6. Chứng minh không regression

Đây là phần quan trọng nhất của tài liệu, vì yêu cầu của bạn là *"đảm bảo không xảy ra bug
của các chức năng khác"*. Với phương án A, điều đó **chứng minh được**, không phải hy vọng.

**Bổ đề 1 — chỉ những dòng ở đúng thời điểm thẻ mới có thể đổi phán quyết.**
`histWithoutRedAtMoment` chỉ bỏ những `h` thoả `|h.t − r.t| ≤ 0.01`. Còn `effectiveLUIn`
chỉ đọc những `h` thoả `h.t ≤ r.t`. Giao của hai điều kiện là `r.t − 0.01 ≤ h.t ≤ r.t`.
Với mọi dòng `r` mà **không có** period thẻ đỏ nào của đội nó nằm trong khoảng 10 ms ấy,
tập period được đọc là **y hệt** trước bản vá ⇒ `squadIn` trả về **y hệt** ⇒ phán quyết
**y hệt**. ∎

**Bổ đề 2 — bỏ một period thẻ đỏ chỉ có thể *thêm* người vào bảng, không bao giờ bớt.**
`applyRedCard` dựng period ấy đúng bằng `effectiveLU(team,t)` **trừ đi một người**
(`xi.splice(i,1)`, và người đó *không* được thả xuống ghế dự bị). Nên bỏ nó đi = đưa **đúng
một người** trở lại, không ai khác bị đụng. Suy ra:

* không dòng nào đang **pass** có thể chuyển thành **refuse** (bảng chỉ rộng ra);
* nhánh `if(!sq.on.length)` (`index.html:3111`, "đội này chưa nộp đội hình") không thể bị
  kích hoạt thêm — bỏ period chỉ làm `on` dài ra.

Nói cách khác: **thay đổi này chỉ có thể nới lỏng, và chỉ nới lỏng đúng tại giây có thẻ
đỏ.** Không tồn tại đường nào để nó làm hỏng một trận đang publish được.

**Bằng chứng thực nghiệm.** Áp bản vá vào `index.html` + `tests/harness.js`, chạy
`node tests/run.js`:

```
1401/1401 passed
```

Bằng đúng con số trước bản vá, **không sửa một dòng test cũ nào** — kể cả 5 test C7 đang
khoá hành vi thẻ đỏ trong `tests/analysis-gate.test.js:246-270`, 20 test trong
`tests/red-card.test.js`, và 9 test trong `tests/card-timeline.test.js`.
Sau đó cả hai file đã được **hoàn nguyên** về nguyên trạng.

---

## 7. Phạm vi ảnh hưởng — cái gì **không** đổi

`histWithoutRow` và `checkShirtNumbers` **chỉ** được gọi từ `checkAnalysis`
(`index.html:3214`), và `checkAnalysis` **chỉ** được gọi từ hộp thoại Submit Analysis
(`index.html:4584` và `4606`). Ngoài ra không nơi nào khác trong toàn kho gọi tới chúng —
đã grep toàn bộ `*.js` + `*.html`.

| Vùng | Ảnh hưởng | Vì sao |
|---|---|---|
| Tab **Tagging** — bảng sự kiện, dot, chain | **0** | không đi qua `checkAnalysis` |
| Tab **Tagging** — cổng số áo lúc gõ (`checkEntryNumbers`) | **0** | dùng `gateHistory`/`squadAt`, đường riêng — xem §11 |
| **Player lists** (`Player-Lists/*`) | **0** | không đọc `histWithoutRow` |
| **Formation modal** (`openFmModal`, `fmEditPeriodTime`) | **0** | đọc thẳng `state.lineups.history` |
| Bảng đội hình ở tab chính (`renderFormationMain`) | **0** | qua `effectiveLU`, không đổi |
| **Substitution** (`planSubGroup`, `applySubGroup`, `subSideEffects`) | **0** | `h.off!=null` loại period sub ra khỏi bộ lọc mới |
| **Red card** (`applyRedCard`, `removeRedSideEffects`) | **0** | không sửa; period vẫn ghi y như cũ |
| **Minutes played** (`playedMinutes`, `shared.js`) | **0** | đọc `lineups.history` gốc |
| Tab **Stats** (`Stats/stats-view.js`, `squadInHalf`) | **0** | bản sao độc lập, đọc `history` gốc |
| Tab **Film** | **0** | không đọc đội hình theo thời gian |
| **PDF report** (`Stats/report.js`) | **0** | dựng từ payload đã publish |
| **Client site** (`client/*`) | **0** | đọc `match_reports`, không chạy cổng |
| **Worker** (`worker/*`) | **0** | không liên quan |
| Supabase (bảng, view `match_stats`, RPC) | **0** | không đổi schema, không đổi payload |
| 10 check còn lại của cổng (C1–C10) | **0** | `checkShirtNumbers` không được chia sẻ với chúng |

**Payload publish không đổi một byte.** Cổng chỉ *đọc*; nó không viết vào `payload.lineups`
hay `payload.rows`. Nên bản trận mà club nhìn thấy là **hoàn toàn như cũ** — khác biệt duy
nhất là trận này *được phép đi ra*.

---

## 8. Bảng trường hợp biên — **đã chạy thật, 18/18 đúng**

Chạy trên `index.html` đã vá, đội khách có No.13 trong XI, thẻ đỏ tại `t = 3958.72`
(H2 60:58.72). `PASS` = C11 cho qua, `REFUSE` = C11 chặn.

| # | Tình huống | Mong đợi | Kết quả |
|---|---|---|---|
| **E1** | **ca trên ảnh** — `foul` + `yellow card` + `red card` cùng một chain, cùng `t` | PASS | ✅ PASS |
| E2 | No.13 chuyền bóng **1 giây sau** thẻ | REFUSE | ✅ `sent off at 60:58.71` |
| E3 | …**0.02 s sau** (vừa ra khỏi `SAME_MOMENT`) | REFUSE | ✅ `sent off at 60:58.71` |
| E4 | No.13 chạm bóng **đúng tại** `t` của thẻ | PASS | ✅ PASS |
| E5 | No.13 làm gì đó **3 phút sau** | REFUSE | ✅ `sent off at 60:58.71` |
| E6 | số áo đội **chưa bao giờ có** (No.99), tag đúng tại `t` | REFUSE | ✅ `not in Barbados's formation` |
| E7 | **đồng đội** (No.7) hành động đúng tại `t` | PASS | ✅ PASS |
| E8 | **đội kia** hành động đúng tại `t` | PASS | ✅ PASS |
| E9 | chuyền `13 → 99` đúng tại `t` — **người nhận vẫn bị soi** | REFUSE | ✅ `No.99 … not in …formation` |
| E10 | chuyền `9 → 13` đúng tại `t` — người nhận được trả lại khoảnh khắc | PASS | ✅ PASS |
| E11 | đã bị đuổi từ **50:00**, `foul` tag tại `t` của **thẻ người khác** | REFUSE | ✅ `sent off at 45:00.00` |
| E12 | **hai người** bị đuổi cùng một khoảnh khắc — mỗi người được trả lại khoảnh khắc của mình | PASS | ✅ PASS |
| E13 | **substitution** tại đúng `t` — **không** được nới (ngoài phạm vi) | REFUSE | ✅ `on the bench at 60:00.00` |
| E14 | dự bị chưa vào sân, hành động tại `t` | REFUSE | ✅ `on the bench…` |
| E15 | **thẻ** cho người ngồi ghế dự bị vẫn hợp lệ | PASS | ✅ PASS |
| E16 | dòng `red card` đứng một mình vẫn không tự từ chối chính nó | PASS | ✅ PASS |
| E17 | period bị **kéo sớm 60 s** so với dòng của nó — hành vi cũ giữ nguyên | REFUSE | ✅ `sent off at 59:58.71` |
| E18 | dòng **không có số áo** tại `t` | PASS | ✅ PASS |

> **E12 quyết định hình dạng bộ lọc.** Bản nháp đầu có thêm điều kiện *"period phải mang
> đúng số áo mà dòng này gọi tên"*; nó **trượt E12**, vì period thẻ thứ hai (dựng chồng lên
> period thứ nhất) cũng đã thiếu người thứ nhất. Bỏ điều kiện số áo đi thì E12 đúng — và
> theo **Bổ đề 2**, bỏ nó **không** làm lỏng thêm bất cứ thứ gì, vì gỡ một period thẻ đỏ chỉ
> trả lại đúng người của chính period ấy.

---

## 9. Bất biến để tự kiểm

| | Bất biến |
|---|---|
| **I1** | Không dòng nào có `t` khác `t` của một thẻ đỏ (quá 10 ms) đổi phán quyết. *(Bổ đề 1)* |
| **I2** | Không dòng nào đang PASS chuyển thành REFUSE. *(Bổ đề 2)* |
| **I3** | Period **substitution** không bao giờ bị bộ lọc mới đụng tới (`h.off!=null`). |
| **I4** | `histWithoutRow` giữ nguyên **từng byte**; mọi test khoá nó vẫn xanh. |
| **I5** | Cổng vẫn **thuần**: không đọc `state.`, không DOM, không `video.` — test `'the gate is pure'` (`analysis-gate.test.js:398`) vẫn kiểm được `histWithoutRedAtMoment`. |
| **I6** | Một đội **không bao giờ** bị chấm bằng bảng của đội kia (`h.team===row.team`). |
| **I7** | Cổng chỉ **đọc**; payload publish không đổi một byte. |
| **I8** | Sau thẻ đỏ, cầu thủ bị đuổi **vẫn** không được tag bất cứ hành động nào — kể từ mili-giây thứ 11. |

---

## 10. Kế hoạch test — `tests/analysis-gate.test.js`

Thêm vào **mục 6 (`the shirt numbers`)**, ngay sau test hiện có
`'C7 · a red card does NOT refuse itself'` (`analysis-gate.test.js:246`). **Không sửa test
cũ nào** ngoài một chỗ duy nhất nói ở cuối mục.

```js
test('C7 · the incident that earned the card is not judged by the card', () => {
  /* The reported case: "13f*yc*rc" is one entry sharing one dot, so the foul and the
     second yellow carry the card's own t. A gate that read the sending-off as being in
     force AT that t refused them both, and said the sentence histWithoutRow exists to
     prevent, one row too early: "No.13  foul  -- sent off at 60:58.72". */
  const t=4025, left=HOME_XI.filter(n=>n!=='6');
  const v=run(payload({lineups:lineups({history:[redSnap('home',left,HOME_BENCH,t,'6')]}),
                       rows:[ev('home','6','foul',t,{grp:'g1',ord:0}),
                             ev('home','6','yellow card',t,{grp:'g1',ord:1}),
                             ev('home','6','red card',t,{grp:'g1',ord:2})]}));
  ok(byId(v,'shirt-numbers').ok,'the whole incident stands, not just the card');
});

test('C7 · but a sending-off is in force from the very next moment', () => {
  // a hundredth of a second past the card is already past it
  const t=4025, left=HOME_XI.filter(n=>n!=='6');
  const c=byId(run(payload({lineups:lineups({history:[redSnap('home',left,HOME_BENCH,t,'6')]}),
                            rows:[ev('home','6','pass success',t+0.02,{playerTo:'9'})]})),
               'shirt-numbers');
  notOk(c.ok,'the three seconds after a red card are not forgiven');
  ok(/sent off at 62:05/.test(c.spots[0]),c.spots[0]);
});

test('C7 · the card-s own moment forgives that side only, and that moment only', () => {
  const t=4025, left=HOME_XI.filter(n=>n!=='6');
  const lu=lineups({history:[redSnap('home',left,HOME_BENCH,t,'6')]});
  // a number the side never had is still refused, at the card's own t
  notOk(byId(run(payload({lineups:lu,rows:[ev('home','99','foul',t)]})),'shirt-numbers').ok);
  // …and so is a substitute who has not come on
  notOk(byId(run(payload({lineups:lu,rows:[ev('home','21','recovery',t)]})),'shirt-numbers').ok);
  // …while a team-mate acting at that same t was never in question
  ok(byId(run(payload({lineups:lu,rows:[ev('home','7','foul',t)]})),'shirt-numbers').ok);
});

test('C7 · two sendings-off in one instant each keep their own moment', () => {
  const t=4025, l6=HOME_XI.filter(n=>n!=='6'), l67=l6.filter(n=>n!=='7');
  const v=run(payload({lineups:lineups({history:[redSnap('home',l6,HOME_BENCH,t,'6'),
                                                 redSnap('home',l67,HOME_BENCH,t,'7')]}),
                       rows:[ev('home','6','foul',t),ev('home','7','foul',t)]}));
  ok(byId(v,'shirt-numbers').ok);
});

test('C7 · a substitution at its own moment is NOT relaxed by this rule', () => {
  /* Deliberately out of scope, and pinned so a later widening is a decision and not a
     drift: the outgoing player is on the bench from the swap, and that is the reading
     the formation panel, minutes played and Stats all take. */
  const t=3900, on=HOME_XI.filter(n=>n!=='7').concat('21');
  const c=byId(run(payload({lineups:lineups({history:[subSnap('home',on,['14','7'],t)]}),
                            rows:[ev('home','7','pass success',t,{playerTo:'9'})]})),
               'shirt-numbers');
  notOk(c.ok,'a sub period is not a sending-off period');
  ok(/on the bench at 60:00/.test(c.spots[0]),c.spots[0]);
});

test('the new filter is pure and touches only sending-off periods', () => {
  const body=grabFunction('histWithoutRedAtMoment');
  notOk(/\bstate\./.test(body),'reads no app state');
  ok(/h\.off!=null/.test(body),'a substitution period is not a sending-off period');
  ok(/SAME_MOMENT/.test(body),'and the window is the named one, not SNAP_WINDOW');
});
```

**Một sửa đổi duy nhất trên test cũ:** thêm `'histWithoutRedAtMoment'` vào mảng tên trong
test `'the gate is pure'` (`analysis-gate.test.js:398`). Đó là **mở rộng phạm vi kiểm**,
không phải nới lỏng.

**Thực tế: +6 test ở đây, +2 ở `entry-numbers.test.js` (§11) → `1409/1409`.**

---

## 11. Cổng thứ hai — `checkEntryNumbers` · **Giai đoạn 2, đã làm (Q3 = có)**

### 11.1 Lỗi giống hệt, đi vào bằng cửa khác

Cổng lúc gõ entry **có đúng lỗi biên này**, chỉ khác đường vào. Ở luồng thường
(`13f*yc*rc` gõ một lần) nó không lộ, vì period chưa tồn tại lúc cổng chạy (§2.4). Nhưng
nếu Analyst **tag thẻ đỏ trước**, rồi mới quay lại thêm cái `foul` ở **đúng giây đó**, thì:

```
ENTRY GATE bad: {"kind":"sent-off","no":"13","t":3958.72}
No.13 was sent off at 60:58.72 and is not on the pitch at 60:58.72.
```

**Đã chạy thật.** Đúng câu vô nghĩa ấy, lần này hiện ra trong `alert()` và **entry bị vứt
đi hoàn toàn** — không dòng nào được ghi.

### 11.2 Sửa (nếu bạn duyệt) — 2 dòng

`checkEntryNumbers` (`index.html:2856`) đã có sẵn `t` của từng chạm:

```diff
-    const sq=squadAt(team,t,hist0);
+    const sq=squadAt(team,t,histWithoutRedAtMoment(hist0||state.lineups.history||[],{team,t}));
```

và cùng phép lọc ấy cho phần dò `red` ngay dưới (`index.html:2882`).

### 11.3 Vì sao tách thành giai đoạn riêng

* Bạn hỏi về **nút Submit Analysis**; đây là tính năng khác (`submitEntry`).
* Nó chạm vào đường **ghi** dữ liệu, chứ không chỉ đường **đọc** — rủi ro khác hẳn.
* Nó đụng `tests/entry-numbers.test.js` (tài liệu riêng:
  [`entry-number-gate-design.md`](entry-number-gate-design.md)).

**Khuyến nghị: làm** — nếu không, hai cổng sẽ **bất đồng** ở đúng luồng này (cổng entry từ
chối cái mà cổng publish cho qua), và comment ở `index.html:2762` đã nói rõ vì sao bất đồng
giữa hai cổng là thứ tệ nhất: *"one gate lets an entry through and the other refuses it,
with nothing on screen to say why"*. Nhưng **chờ bạn gật** (Q3).

---

## 12. Trường hợp anh em — **cố ý không làm**

Substitution có **đúng cùng một lỗi biên**: nếu No.7 bị thay ra ở `t` và có một sự kiện của
No.7 tag ở **đúng** `t` đó, C11 nói `on the bench at 65:00, not on the pitch` (E13 ở §8).

**Không đề xuất sửa trong đợt này**, vì:

1. Bạn không báo lỗi này, và nó **không** chặn publish trận Barbados;
2. Cách đọc "thay người có hiệu lực ngay tại `t`" đang được **ba nơi khác dùng chung**:
   bảng đội hình tab chính, `playedMinutes` (`shared.js`), và `squadInHalf` (`Stats/`) —
   nới ở cổng mà không nới ở ba nơi kia sẽ tạo ra **bất đồng thật**, không phải bất đồng
   trên giấy;
3. Với thay người, cách đọc hiện tại **có lý**: cầu thủ ra sân là ra ngay, và anh ta **vẫn
   nằm trong `all`** (ở ghế dự bị), nên `yellow card` / `substitution` vẫn hợp lệ — hậu quả
   nhẹ hơn hẳn thẻ đỏ (bị gỡ khỏi bảng **hoàn toàn**).

Test E13 ở §10 **ghim** hành vi hiện tại lại, để lần sau nới ra là một **quyết định**, không
phải một cú trôi.

---

## 13. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Nới lỏng che mất một lỗi tag thật | **thấp** | chỉ trong 10 ms quanh thẻ; ngoài ra cổng giữ nguyên độ chặt (E2/E3/E5) |
| Sai số dấu phẩy động làm `SAME_MOMENT` hụt | **thấp** | `double precision` hai đầu; 0.01 rộng hơn sai số double ở thang giây nhiều bậc |
| `SAME_MOMENT` bị nhầm với `SNAP_WINDOW` về sau | **trung bình** | tên khác hẳn + comment giải thích tại sao khác + test §10 khoá `SAME_MOMENT` |
| Trận **đã publish** trước đây có sẵn lỗi này | **không** | cổng chỉ chạy lúc publish; bản cũ không bị đụng, publish lại là hết |
| Người dùng cũ chạy JS cũ (cache) | **không** | `index.html` là trang, browser tải mới mỗi lần; không có `?v=` để lỡ |

---

## 14. Phân pha

**Giai đoạn 1 — C11 (đợt này, sau khi bạn chốt Q1/Q2/Q4)**

- [x] `index.html`: thêm `SAME_MOMENT` + `histWithoutRedAtMoment` (§5.1)
- [x] `index.html`: sửa 1 dòng trong `checkShirtNumbers` (§5.2)
- [x] `tests/harness.js`: thêm 2 tên (§5.3)
- [x] `tests/analysis-gate.test.js`: +6 test (§10), và thêm tên vào test `'the gate is pure'`
- [x] `node tests/run.js` → **1409/1409**
- [ ] **Còn lại cho bạn:** mở lại Submit Analysis trên Saint Lucia vs Barbados → check 11
      phải `✓`, và bảng phải đủ **11/11 passed** thì nút `Publish this match` mới mở
- [x] Không cache-bust, không migration, không đụng file nào khác

**Giai đoạn 2 — cổng entry (chỉ khi Q3 = có)**

- [x] `index.html`: `checkEntryNumbers` dùng chung bộ lọc (§11.2)
- [x] `tests/entry-numbers.test.js`: +2 test (T8c, T8d) cho luồng "thẻ đỏ tag trước,
      foul thêm sau"
- [ ] **Chưa làm:** cập nhật [`entry-number-gate-design.md`](entry-number-gate-design.md)
      — tài liệu ấy là của tính năng khác, sửa nó cần bạn cho phép riêng

**Giai đoạn 3 — không thuộc đợt này**, chỉ ghi ra để khỏi trôi: khoảnh khắc của **substitution**
(§12). Cần quyết định chung với `shared.js` + `Stats/`.

---

## 15. Câu hỏi cần bạn chốt

Cả bốn đã được chốt **theo đề xuất** vào 2026-08-30.

| | Câu hỏi | Đã chốt |
|---|---|---|
| **Q1** | Cửa sổ tha bổng: **A** đúng khoảnh khắc (`0.01 s`) · **B** ±3 s · **C** theo `grp`? | **A** — phương án duy nhất có chứng minh biên (§6), và không tha 3 giây sau thẻ |
| **Q2** | Có nên tha luôn các dòng nằm trong **±3 s trước** thẻ? | **Không** — dot đặt *trước* thẻ đã tự hợp lệ (`h.t <= t` loại period ra); chỉ đúng `t` mới hỏng |
| **Q3** | Có làm **Giai đoạn 2** (cổng entry, §11) trong cùng đợt không? | **Có** — đã làm; hai cổng giờ đọc cùng một luật ở cùng một khoảnh khắc |
| **Q4** | Tên hàm `histWithoutRedAtMoment` / hằng `SAME_MOMENT` — giữ hay đổi? | **Giữ.** Cặp `histWithoutRow` / `histWithoutRedAtMoment` đọc liền mạch; `SAME_MOMENT` cố ý **không** giống `SNAP_WINDOW` |

---

## 16. Chốt lại một câu

> Cổng số áo đang đọc *"bị đuổi lúc 60:58.72"* là *"không có mặt lúc 60:58.72"*.
> Nhưng cầu thủ **có** mặt lúc 60:58.72 — đó chính là lúc anh ta phạm lỗi.
> Sửa đúng một điều: **án phạt bắt đầu từ mili-giây sau, không phải từ chính khoảnh khắc đó.**
