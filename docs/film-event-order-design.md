# Film — Event Filter Order — Detailed Design

**Bộ lọc `All events` ở trang Film đang xếp tên sự kiện theo bảng chữ cái, nên `blocked shot`
nằm cạnh `block`, `goal` lạc giữa `free-kick` và `goal kick`, và người dùng phải quét cả danh
sách mới gom được "mấy pha dứt điểm". Tài liệu này mô tả việc thay thứ tự đó bằng thứ tự
nghiệp vụ — **shooting → distribution → defensive → other → body part** — bằng đúng **hai
dòng** chạm vào code sẵn có, cộng bằng chứng vì sao không một tab nào khác đổi một pixel.**

Trạng thái: **đã triển khai** (2026-08-27), sau khi Q2 và Q4 được chốt đúng như đề xuất.
`node tests/run.js` → **1281/1281 passed**, trong đó **1269 test cũ pass nguyên vẹn** và **12
test mới**. Chỉ `tests/film-slicers.test.js` bị sửa; 16 file test khác cũng đọc
`Stats/stats-view.js` và không phải sửa một dòng nào.

> **Bản sửa 2 (cùng ngày, đã được cho phép):** ba mục §9 để ngỏ nay đã làm — **tiêu đề nhóm
> trong panel** (§9.1), **tick cả nhóm một phát** (§9.2) và **sửa chính tả `take-on succes` /
> `gain possesion`** (§9.4), cái sau bằng một bảng alias tại `evKey` nên **không migration và
> không mất một dòng dữ liệu nào**. §9.3 vẫn không làm. Toàn bộ ở **§11**;
> `node tests/run.js` → **1298/1298**.

Quy mô thực tế: `Stats/stats-view.js` **+45 / −2** (trong đó **đúng 2 dòng** là sửa code sẵn
có — hai lời gọi `.sort()`; 43 dòng còn lại là bảng thứ tự và comment), `tests/film-slicers.test.js`
**+111 / −2**, và **3 dòng `?v=`**. Không file mới ⇒ không phải thêm dòng `cp` nào vào
`deploy.yml`.

> **Bản sửa 1 — phát hiện lúc triển khai: phải bump BA số, không phải hai.** §6 bản đầu chỉ
> liệt kê `stats-view.js` (2 nơi). Nhưng một trong hai nơi đó **nằm bên trong** `client/assets/app.js`,
> nên chính app.js đổi nội dung ⇒ nó cũng phải bump `?v=42 → 43` ở `client/app.html:81`. Bỏ sót
> thì trình duyệt cũ của channel giữ app.js v42, mà app.js v42 lại đi nạp `stats-view.js?v=20` —
> thay đổi không bao giờ tới nơi, và không có một dòng lỗi nào. Test *"changing a shared asset
> moves its version with it"* bắt đúng ca này; xem §6 đã cập nhật.

Sáu câu hỏi phải chốt trước khi gõ dòng đầu tiên:

| | Câu hỏi | Đề xuất |
|---|---|---|
| **Q1** | Thứ tự lấy từ đâu | **Một bảng tên tường minh trong `Stats/stats-view.js`**, xếp theo đúng taxonomy `PLAYER_CATS` mà shared.js đã dùng cho 4 tab của bảng cầu thủ. Không suy diễn từ `EVENT_INC` lúc chạy (§4.3) |
| **Q2** | `assist` và `key pass` thuộc nhóm nào | **shooting** — vì `PLAYER_CATS.shooting` đã đặt Goals · Assists · Key Passes cạnh nhau, và bảng Stats của chính app đọc như vậy. Muốn đẩy sang distribution: đổi chỗ **2 dòng** trong bảng §3.2 |
| **Q3** | Sự kiện không nằm trong bảng (tự đặt, sai chính tả, môn khác) | **Không bao giờ biến mất.** Rơi vào rổ thứ sáu ở CUỐI danh sách, xếp A–Z trong rổ đó (§3.3) |
| **Q4** | Thứ tự trong nhóm body part | **Theo đúng thứ tự bạn viết trong yêu cầu**: right foot · left foot · upper body · head · lower body. Lưu ý `BODY_PARTS` trong shared.js đang liệt kê `head` **trước** `upper body`; muốn khớp thì đổi chỗ 2 dòng (§3.2, mục 5) |
| **Q5** | Có thêm tiêu đề nhóm ("SHOOTING") vào panel không | **KHÔNG trong bản này.** Đó là đổi giao diện, không phải đổi thứ tự, và nó đụng vào `boxes.length` — cơ chế "tick hết = không tick" (§5.2, §9.1). Để riêng, chờ duyệt riêng |
| **Q6** | Danh sách event bên phải video có đổi thứ tự không | **KHÔNG.** Danh sách đó xếp theo **thời gian trận đấu** và phải giữ nguyên (§2) |

### Phạm vi thay đổi

| File | Thay đổi | Chạm code sẵn có? |
|---|---|---|
| `Stats/stats-view.js` | +3 khai báo mới đặt ngay trên `filmChoices`; sửa 2 lời gọi `.sort()` | **2 dòng**: 1326 và 1381 |
| `Stats/index.html` | `stats-view.js?v=20 → ?v=21` (dòng 63) | 1 dòng, chỉ là số |
| `client/assets/app.js` | `Stats/stats-view.js?v=20 → ?v=21` (dòng 1634) | 1 dòng, chỉ là số |
| `client/app.html` | `assets/app.js?v=42 → ?v=43` (dòng 81) — hệ quả bắt buộc của dòng trên | 1 dòng, chỉ là số |
| `tests/film-slicers.test.js` | nâng 1 assert cũ + thêm 1 khối test mới + nâng sandbox | test, không phải sản phẩm |
| `tests/asset-versions.json` | regenerate bằng `--update` | sinh tự động |

**0 dòng** ở: `shared.js` · `index.html` (tagger) · `cloud-sync.js` · `Stats/report.js` ·
`Stats/stats-view.css` · `client/assets/film-tools.js` · `client/assets/film-tools.css` ·
`client/assets/app.css` · `client/index.html` · `client/guide.html` · `Player-Lists/*` ·
`worker/*` · `supabase/*` · `.github/workflows/deploy.yml`.

---

## 0. Trả lời thẳng câu hỏi

> *"Bộ lọc events đang sắp A–Z. Tôi cần shooting, distribution, defensive, other, body part.
> Đảm bảo không sinh bug ở tab khác."*

**Làm được, và nó nhỏ hơn nhiều so với vẻ ngoài.** Toàn bộ thứ tự của bộ lọc do **đúng hai
lời gọi `.sort()` không tham số** quyết định — `Stats/stats-view.js:1326` và `:1381`. Không có
nơi thứ ba nào xếp lại danh sách này: `filmSyncSlicer()` chỉ đổi nhãn nút, `filmBindSlicers()`
chỉ gắn sự kiện, `filmSlicerHTML()` in ra đúng thứ tự nó nhận được.

**Và cái taxonomy bạn muốn thì app đã có sẵn.** `shared.js` khai báo `PLAYER_CATS` với **đúng
bốn nhóm, đúng thứ tự bạn nêu**: `shooting` → `distribution` → `defensive` → `other`; đó là 4
tab của bảng thống kê cầu thủ mà analyst đọc mỗi ngày, và `Stats/stats-view.js:57` đã dùng lại
nguyên xi (`const STAT_CATS=PLAYER_CATS;`). Nhóm thứ năm — body part — cũng đã có tên trong
`shared.js` dưới dạng `BODY_PARTS`. Nghĩa là thứ tự mới **không phải một quy ước mới do người
viết code nghĩ ra**, nó là quy ước đã được duyệt ở chỗ khác, nay áp vào bộ lọc.

**Rủi ro cho tab khác: gần bằng không, và đo được.** Hai hàm bị sửa (`filmChoices`,
`filmSlicers`) chỉ có **một** nơi gọi trong toàn repo — `filmHTML()` ở dòng 1480, tức là trong
chính view Film. Không tab nào khác (Overall · Dashboard · Stats · Data · Tagger ·
Player-Lists · report PDF/XLSX) đọc chúng. Bằng chứng ở §5.

---

## 1. Hôm nay nó đang làm gì

### 1.1 Hai chỗ quyết định thứ tự

**`Stats/stats-view.js:1319–1327` — `filmChoices()`**: quét mọi cue của hiệp đang mở, gom tên
cầu thủ và tên sự kiện thành hai tập hợp, rồi trả về:

```js
return {players:Object.keys(players).sort((a,b)=>(+a||0)-(+b||0)),
        events:Object.keys(events).sort()};          // ← dòng 1326: A–Z
```

Chú ý cầu thủ **đã** có comparator riêng (số học, để "14" không đứng trước "2"). Sự kiện thì
không — `.sort()` trần là so sánh chuỗi UTF-16.

**`Stats/stats-view.js:1371–1383` — `filmSlicers()`**: dựng mô tả của ba slicer. Dòng cuối:

```js
{key:'event',all:'All events',many:'events',
 opts:union(choices.events,picked('event')).sort().map(plain)}   // ← dòng 1381: A–Z lần hai
```

Sort **hai lần** không thừa: `union()` chèn thêm những giá trị đang được tick nhưng hiệp này
không có sự kiện nào (để một lựa chọn ở hiệp 1 không biến mất khi sang hiệp 2 — xem test
*"a pick that this half has no event for is still offered"*). Những giá trị chèn thêm đó phải
được xếp vào đúng chỗ, nên chỗ này phải sort lại sau khi hợp nhất.

Đó là **toàn bộ** cơ chế. Không có cache, không có thứ tự nào được ghi xuống localStorage,
không có payload nào của report mang theo thứ tự này.

### 1.2 Vì sao A–Z là sai với công việc đang làm

Với bộ từ vựng thật của môn bóng đá trong app (35 sự kiện mặc định + body part + các tên
người dùng tự thêm), A–Z tạo ra đúng những cạnh-nhau vô nghĩa sau:

| A–Z cho ra | Vấn đề |
|---|---|
| `block` → `blocked shot` | Hai thứ trái ngược nhau: một cái là **phòng ngự** (chặn bóng), một cái là **dứt điểm** bị chặn. Cạnh nhau, chỉ khác 2 ký tự, tick nhầm là chuyện tất yếu |
| `foul` → `foul throw` → `free-kick` | `foul throw` là lỗi ném biên, `free-kick` là tình huống cố định — chen vào giữa nhóm kỷ luật |
| `goal` kẹt giữa `free-kick` và `goal kick` | Sự kiện quan trọng nhất trận đấu nằm ở giữa danh sách, không ở đầu |
| `head` · `left foot` · `right foot` · `upper body` rải khắp bảng chữ cái | Bộ phận cơ thể là **thuộc tính của cú dứt điểm** (`shotBodyPart()` trong shared.js đọc đúng như vậy), không phải một loại sự kiện ngang hàng |
| `pass fail` trước `pass success` | Cặp thành/bại bị đảo: mắt đọc quen "thành công trước, thất bại sau" — đúng như `PLAYER_CATS` in ra (*Passes → Passes Completed*) |

Cách dùng thật của bộ lọc này là dựng playlist theo chủ đề — đúng việc mô tả ở
`docs/film-telestration-design.md` §0 và ở guide `client/guide.html` §05. Một analyst dựng reel
"Goal & Chance Creation" cần tick 4–7 ô nằm cạnh nhau; hôm nay 4–7 ô đó nằm ở bốn góc khác nhau
của một panel cuộn cao tối đa 230px (`FILM_SL_MAX`).

---

## 2. Ranh giới

**Trong phạm vi:**

* Thứ tự các ô checkbox trong panel của slicer **`event`**, ở cả hai host (trang Stats của
  tagger và tab Film trong channel — cùng một file).

**Ngoài phạm vi, không đụng một dòng nào:**

| Thứ | Vì sao để yên |
|---|---|
| Slicer **`team`** | Chỉ có 2 lựa chọn, thứ tự home → away, đã đúng |
| Slicer **`player`** | Đã có comparator số học riêng; test *"numerically, not 14 before 2"* khoá nó lại |
| **Danh sách event bên phải video** (`filmRowsHTML`) | Xếp theo **thời gian trận** trong `filmCues()`; đổi nó là phá chính chức năng của Film |
| **Nội dung** lựa chọn (tập tên) | Chỉ đổi thứ tự — không thêm, không bớt, không gộp, không đổi tên lựa chọn nào |
| **Giá trị** lựa chọn (`o.v`) | Phải giữ nguyên xi chuỗi thô, vì `filmMatches()` so sánh `f.event.indexOf(r.event)` — khớp chuỗi tuyệt đối (§4.4) |
| Bảng sự kiện trong tagger, macro, hotkey | Đó là bàn phím của người nhập liệu, không liên quan |
| Thứ tự cột trong Stats / Data / report | Đã do `PLAYER_CATS` và `TEAM_SECTIONS` quyết định, giữ nguyên |

---

## 3. Thứ tự đề xuất

### 3.1 Nguồn của thứ tự: taxonomy đã có, không phải quy ước mới

`shared.js` đã phân loại **từng sự kiện** qua `EVENT_INC` (sự kiện → các ô thống kê nó làm
tăng) và **từng ô thống kê** qua `PLAYER_CATS` (ô → nhóm). Ghép hai bảng đó là ra nhóm của mỗi
sự kiện. Đã chạy phép ghép này trên `shared.js` hiện tại; kết quả:

| Nhóm | Sự kiện mà `EVENT_INC` + `PLAYER_CATS` xếp vào đó |
|---|---|
| **shooting** | goal · assist · key pass · shot on target · shot off target · blocked shot · miss shot |
| **distribution** | pass success · pass fail · cross success · cross fail · take-on succes · take-on fail · step in |
| **defensive** | tackle success · tackle fail · interception · clearance · block · recovery · ground duel success · ground duel fail · aerial duel success · aerial duel fail · mistake |
| **other** | corner-kick · free-kick · penalty kick · throw-ins · throw-in · goal kick · foul · foul throw · handball foul · foul won · offside · save |
| **cả hai** | `take-on concern` → `takeOns` (distribution) **và** `takeOnConcerns` (defensive) |

Ba loại tên **không** có trong `EVENT_INC`, phải xếp bằng tay:

1. `yellow card`, `red card` — không đi qua `EVENT_INC`; thẻ được đọc bằng `classifyCards()`.
   → **other**.
2. `substitution`, `pause`, `gain possesion` — có trong danh sách sự kiện mặc định của tagger
   nhưng không sinh chỉ số nào. → **other**.
3. `right foot`, `left foot`, `head`, `upper body`, `lower body` — nằm ở `BODY_PARTS`, được
   `shotBodyPart()` đọc như **thuộc tính của cú sút**. → **nhóm thứ năm, đứng cuối**, đúng như
   yêu cầu.

`take-on concern` chốt là **defensive**: chính comment trong `shared.js` viết "counted on its
own under Defensive", và `PLAYER_CATS.defensive` có cột riêng *Take-on Concerns*.

### 3.2 Bảng thứ tự đầy đủ

49 tên, viết thường — bảng chỉ dùng để **tra**, không dùng để hiển thị (§4.4):

**1 · Shooting** — 7 tên, theo thứ tự cột của `PLAYER_CATS.shooting`

```
 0  goal
 1  assist
 2  key pass
 3  shot on target
 4  shot off target
 5  blocked shot
 6  miss shot
```

**2 · Distribution** — 8 tên, theo thứ tự cột của `PLAYER_CATS.distribution`, thành trước bại sau

```
 7  pass success
 8  pass fail
 9  cross success
10  cross fail
11  take-on succes        ← chính tả thật của tagger (thiếu chữ s), bắt buộc phải có
12  take-on success       ← chính tả đúng, phòng khi tên được sửa lại sau này
13  take-on fail
14  step in
```

**3 · Defensive** — 12 tên

```
15  tackle success
16  tackle fail
17  interception
18  clearance
19  block
20  recovery
21  ground duel success
22  ground duel fail
23  aerial duel success
24  aerial duel fail
25  take-on concern
26  mistake
```

**4 · Other** — 17 tên: set piece → lỗi → kỷ luật → thủ môn → hành chính

```
27  corner-kick
28  free-kick
29  penalty kick
30  throw-ins             ← "throw-Ins" của tagger tra về đây qua evKey
31  throw-in
32  goal kick
33  foul
34  foul throw
35  handball foul
36  foul won
37  offside
38  save
39  yellow card
40  red card
41  substitution
42  gain possesion        ← chính tả thật của tagger (thiếu chữ s)
43  pause
```

**5 · Body part** — 5 tên, theo đúng thứ tự trong yêu cầu

```
44  right foot
45  left foot
46  upper body
47  head
48  lower body
```

> **Điểm cần xác nhận (Q4).** `BODY_PARTS` trong `shared.js` đang liệt kê
> `right foot · left foot · head · upper body · lower body` — tức `head` **trước** `upper body`.
> Bảng trên theo thứ tự bạn viết trong yêu cầu. Hai cái không xung đột về chức năng (bảng này
> chỉ phục vụ bộ lọc Film), nhưng muốn thống nhất thì đổi chỗ dòng 46 và 47.

### 3.3 Sự kiện lạ — rổ thứ sáu, và vì sao nó bắt buộc phải có

Danh sách sự kiện trong app này **do người dùng tự sửa được** (nút Event trong tagger). Bất kỳ
tên nào không có trong bảng §3.2 — môn khác, tên tự đặt, tên gõ sai, tên tiếng Việt — nhận
hạng `FILM_EV_ORDER.length` và rơi xuống **cuối danh sách**, xếp A–Z trong nội bộ rổ đó.

Đây là bất biến quan trọng nhất của cả thiết kế: **một sự kiện không bao giờ biến mất khỏi bộ
lọc chỉ vì bảng thứ tự chưa biết tên nó.** Làm ngược lại (lọc bỏ tên lạ) thì một trận tag bằng
bộ sự kiện tuỳ biến sẽ có bộ lọc trống rỗng, và người dùng mất khả năng lọc mà không có một
dòng lỗi nào để lần ra.

### 3.4 Ba cái bẫy về tên, đã tính

1. **Hoa/thường.** Tagger cho phép gõ `Goal`, `throw-Ins`, `SHOT ON TARGET`. Tra hạng **luôn**
   đi qua `evKey()` (trim + lowercase) — đúng cơ chế mà `tests/event-name-case.test.js` khoá lại
   sau sự cố "Throw-ins đọc ra 0" ngày 2026-07-24.
2. **Hai cách viết cùng tồn tại trong một trận.** Nếu dữ liệu có cả `Goal` lẫn `goal`, đó là
   **hai giá trị lọc khác nhau** (`filmMatches` khớp tuyệt đối) và **cả hai phải còn**. Chúng
   nhận cùng hạng rồi tie-break đưa về nằm sát nhau. Không gộp, không bỏ.
3. **Lỗi chính tả trong danh sách mặc định.** `take-on succes` và `gain possesion` là chính tả
   **thật** đang chạy trong `index.html` và trong `EVENT_INC`. Bảng thứ tự chứa cả bản sai lẫn
   bản đúng, nên ngày nào sửa chính tả ở tagger thì bộ lọc vẫn không lệch hàng.

---

## 4. Thiết kế kỹ thuật

### 4.1 Ba khai báo mới, đặt ngay trên `filmChoices()`

Đặt ở khối Film của `Stats/stats-view.js` (quanh dòng 1318), **không** ở đầu file — nó thuộc về
Film và chỉ Film đọc.

```js
/* Thứ tự nghiệp vụ của bộ lọc sự kiện: shooting · distribution · defensive ·
   other · body part — đúng bốn nhóm PLAYER_CATS mà bảng cầu thủ đã đọc theo,
   cộng nhóm bộ phận cơ thể của BODY_PARTS. Viết thường: tra luôn qua evKey().
   Tên nào không có ở đây KHÔNG biến mất — nó xuống cuối, A–Z (xem filmEvCmp). */
const FILM_EV_ORDER=[
  'goal','assist','key pass','shot on target','shot off target','blocked shot','miss shot',
  'pass success','pass fail','cross success','cross fail',
  'take-on succes','take-on success','take-on fail','step in',
  'tackle success','tackle fail','interception','clearance','block','recovery',
  'ground duel success','ground duel fail','aerial duel success','aerial duel fail',
  'take-on concern','mistake',
  'corner-kick','free-kick','penalty kick','throw-ins','throw-in','goal kick',
  'foul','foul throw','handball foul','foul won','offside','save',
  'yellow card','red card','substitution','gain possesion','pause',
  'right foot','left foot','upper body','head','lower body'
];
const filmEvRank=e=>{const i=FILM_EV_ORDER.indexOf(evKey(e));
  return i<0?FILM_EV_ORDER.length:i;};
/* Hạng trước, rồi A–Z để hai tên cùng hạng (và cả rổ "chưa biết") có một thứ tự
   xác định — hai lần render cùng dữ liệu phải cho ra cùng một danh sách. */
const filmEvCmp=(a,b)=>{const d=filmEvRank(a)-filmEvRank(b); if(d)return d;
  const x=evKey(a),y=evKey(b); return x<y?-1:x>y?1:(a<b?-1:a>b?1:0);};
```

Ba lưu ý về **harness test**, không phải về trình duyệt:

* `tests/harness.js` `grabConst()` quét tới dấu `;` ở **độ sâu 0**, nên mỗi khai báo phải kết
  thúc bằng `;` tường minh — đã có.
* `scan()` bỏ qua chuỗi và comment nhưng **không hiểu regex literal**; ba khai báo trên không có
  regex nào (đây đúng là cái bẫy từng làm harness báo *"unbalanced source while scanning"*).
* `filmEvRank` / `filmEvCmp` là **arrow const**, nên trong test phải lấy bằng `grabConst`,
  **không** phải `grabFunction` (hàm đó chỉ khớp `function name(`).

### 4.2 Hai điểm gọi — toàn bộ phần "sửa code sẵn có"

**`filmChoices()`, dòng 1326:**

```js
-        events:Object.keys(events).sort()};
+        events:Object.keys(events).sort(filmEvCmp)};
```

**`filmSlicers()`, dòng 1381:**

```js
-     opts:union(choices.events,picked('event')).sort().map(plain)}
+     opts:union(choices.events,picked('event')).sort(filmEvCmp).map(plain)}
```

Hết. Không đổi chữ ký hàm, không đổi hình dạng dữ liệu trả về, không đổi một ký tự nào của
`filmSlicerHTML` · `filmSlicerLabel` · `filmSlicerFit` · `filmSlicerOpen` · `filmSyncSlicer` ·
`filmBindSlicers` · `filmDocClick` · `filmMatches` · `filmRelist`.

**Vì sao sửa cả hai chỗ chứ không chỉ chỗ sau?** Chỗ sau (`filmSlicers`) là chỗ quyết định cái
hiển thị, nên về lý chỉ cần nó. Nhưng `filmChoices()` là một hàm **công khai trong file**, trả
về `{players, events}` đã sắp xếp; để lại một mảng A–Z ở đó nghĩa là người đọc code sau này
thấy hai thứ tự khác nhau cho cùng một khái niệm. Sửa cả hai giữ cho file chỉ có **một** câu
trả lời cho "sự kiện xếp thế nào".

### 4.3 Vì sao bảng nằm ở `stats-view.js`, không phải `shared.js`

Đặt vào `shared.js` nghe hợp lý hơn (nó là nhà của `EVENT_INC`, `PLAYER_CATS`, `BODY_PARTS`),
nhưng đắt hơn hẳn mà không mua thêm được gì:

| | Đặt ở `stats-view.js` (đề xuất) | Đặt ở `shared.js` |
|---|---|---|
| Số file phải bump `?v=` | **1** (`stats-view.js`, ở 2 nơi) | **2** (thêm `shared.js`, ở **3** nơi: `Stats/index.html`, `Player-Lists/index.html`, `client/assets/app.js`) |
| Trang bị kéo vào nếu bump sót | Stats + channel | thêm **Player-Lists** và **tagger** — hai chỗ chẳng liên quan gì tới bộ lọc Film |
| Ai đọc bảng này | chỉ Film | vẫn chỉ Film |

Quy tắc đã học của repo này: sửa `shared.js` là phải bump `?v=` ở **mọi** trang nạp nó, quên
một chỗ thì trình duyệt cũ chạy code cũ mà không có một dòng lỗi nào. Với một bảng chỉ một view
đọc, cái giá đó không đáng.

**Còn `evKey` — nó ở `shared.js` mà?** Đúng, và `stats-view.js` **đã** gọi `evKey` ở 8 chỗ
(dòng 230, 232, 237, 245, 417, 487, 493, 974) cùng `SHOT_KINDS` và `PLAYER_CATS` (dòng 57) như
biến toàn cục ở top level. Cả hai host đều nạp `shared.js` **trước** `stats-view.js`
(`Stats/index.html:62–63`; `client/assets/app.js:1623` rồi `:1634`, với comment ngay tại chỗ:
*"order matters: shared.js before the view"*). Dùng thêm `evKey` **không tạo phụ thuộc mới
nào** — nó là phụ thuộc đã có từ trước.

### 4.4 Chuẩn hoá để TRA, không chuẩn hoá GIÁ TRỊ

Đây là chỗ dễ hỏng nhất nếu làm ẩu, nên nói rõ:

* `filmEvRank(e)` gọi `evKey(e)` **chỉ để tìm hạng**.
* Chuỗi đi vào `opts` vẫn là **chuỗi thô** lấy từ `r.event` (`plain=v=>({v:v,lbl:v})` giữ
  nguyên). Không lowercase, không trim, không đổi.

Vì sao bắt buộc: `filmMatches()` lọc bằng `f.event.indexOf(r.event)` — **khớp chuỗi tuyệt đối**
với giá trị trong `filmFilter.event`, mà giá trị đó đến thẳng từ `box.value` của ô checkbox.
Nếu bộ lọc hiển thị `goal` mà dữ liệu tag là `Goal`, tick vào sẽ lọc ra **rỗng** — đúng loại bug
"không có lỗi, chỉ là không có kết quả" mà `event-name-case.test.js` được viết ra để chặn.

### 4.5 Ổn định và xác định

`Array.prototype.sort` là **stable** từ ES2019 (mọi trình duyệt trong phạm vi hỗ trợ của app đều
đã có). Dù vậy `filmEvCmp` vẫn tie-break tường minh xuống tận so sánh chuỗi thô, nên thứ tự
**không** phụ thuộc vào thứ tự chèn của `Object.keys()`. Hai lần render cùng một hiệp cho ra
cùng một danh sách, kể cả sau khi `union()` chèn thêm lựa chọn từ hiệp trước.

### 4.6 Chi phí

`indexOf` trên mảng 49 phần tử, gọi 2 lần mỗi phép so sánh. Một trận thực tế có 30–45 tên sự
kiện khác nhau ⇒ khoảng `45·log₂45 ≈ 250` phép so sánh ⇒ ~500 lần `indexOf` ⇒ dưới 0,1 ms,
**một lần cho mỗi lần render view Film** (đổi hiệp, hoặc redraw). Không đáng đánh đổi lấy một
bảng hash dựng bằng IIFE — thứ sẽ bắt `grabConst` trong harness quét qua một khối phức tạp hơn
mà chẳng đo được lợi ích nào.

---

## 5. Bảo đảm không vỡ chức năng khác

### 5.1 Ai đọc cái gì

| Tab / màn hình | Có đọc `filmChoices` / `filmSlicers`? | Vì sao an toàn |
|---|---|---|
| **Film** (channel + Stats) | **Có** — qua `filmHTML()` dòng 1480, nơi gọi duy nhất trong repo | Đây chính là thứ đang được sửa |
| **Overall** | Không | `renderStats()` rẽ nhánh `if(statView==='film'){renderFilm(holder);return;}` (dòng 101) trước khi tới các view khác |
| **Dashboard** (bản đồ, heatmap) | Không | Đọc `rows` + `PLAYER_CATS`; không tham chiếu hai hàm này |
| **Stats** (bảng cầu thủ) | Không | Cột do `PLAYER_CATS` quyết định, **không bị sửa** |
| **Data** (cả mùa, channel) | Không | `client/assets/app.js` không tham chiếu `filmChoices`/`filmSlicers` |
| **Report PDF / XLSX** | Không | `Stats/report.js` không tham chiếu; payload đóng băng của `buildReport` không mang thứ tự nào |
| **Tagger** (`index.html`) | Không | Không nạp `stats-view.js` |
| **Player-Lists** | Không | Chỉ nạp `shared.js` — file này **không bị sửa** |
| **Bộ công cụ analyst** (`film-tools.js`) | Không | 4 lời gọi vào `stats-view.js` là `attach/detach/key/full`; không đụng slicer |

Kiểm chứng lại bằng một lệnh trước khi merge — kết quả phải chỉ ra đúng các dòng đã liệt kê:

```bash
grep -rn "filmChoices\|filmSlicers\|FILM_EV_ORDER\|filmEvCmp\|filmEvRank" --include=*.js --include=*.html .
```

**Lưu ý một-file-hai-nơi:** `Stats/stats-view.js` là **cùng một file** chạy ở trang Stats của
analyst và ở tab Film trong channel của client. Đổi thứ tự ⇒ **cả hai** nơi cùng đổi. Đó là chủ
ý (một implementation, không thể lệch nhau), nhưng client sẽ thấy khác đi ngay ở lần tải sau —
nên báo trước nếu có buổi làm việc với họ trong ngày deploy.

### 5.2 Bảy bất biến phải còn nguyên sau khi sửa

Mỗi cái đều kiểm được bằng test, và §7 kiểm đủ bảy:

1. **Tập lựa chọn không đổi.** Cùng dữ liệu vào ⇒ cùng số ô checkbox, cùng bộ giá trị, chỉ khác
   thứ tự. Không tên nào biến mất, không tên nào sinh thêm.
2. **Giá trị lọc là chuỗi thô.** `o.v` vẫn khớp tuyệt đối với `r.event` (§4.4).
3. **"Tick hết = không tick" còn nguyên.** `filmBindSlicers` dòng 1796 so
   `next.length>=boxes.length`, với `boxes` = `.fm-sl-opt input[value]`. Đổi thứ tự không đổi số
   lượng ⇒ ngưỡng không đổi. *(Đây chính là lý do Q5 — thêm tiêu đề nhóm — bị tách ra: một phần
   tử mới trong panel có nguy cơ lọt vào selector đó và làm lệch ngưỡng.)*
4. **Lựa chọn từ hiệp trước vẫn được mang sang.** `union()` không bị đụng; test cũ *"a pick that
   this half has no event for is still offered, and still ticked"* phải xanh nguyên trạng.
5. **Nhãn nút không đổi.** `filmSlicerLabel` đọc `s.all` / `s.opts.filter(o=>o.v===sel[0])` /
   `sel.length+' '+s.many` — không cái nào phụ thuộc thứ tự.
6. **Bàn phím không đổi.** `filmKeys` nhường phím khi panel đang mở (dòng 1829–1833); không liên
   quan tới thứ tự.
7. **Danh sách event bên phải video không đổi một dòng nào** — vẫn theo thời gian trận.

### 5.3 Không đụng tới (0 dòng)

`shared.js` · `index.html` (tagger) · `cloud-sync.js` · `Stats/report.js` ·
`Stats/stats-view.css` · `client/assets/film-tools.js` · `client/assets/film-tools.css` ·
`client/assets/app.css` · `client/assets/supa.js` · `auth.js` · `client/index.html` ·
`client/login.html` · `client/guide.html` · `Player-Lists/*` · `worker/*` · `supabase/*` ·
`.github/workflows/deploy.yml`.

---

## 6. Checklist bắt buộc khi triển khai (cache-bust)

Site không có build step; trình duyệt đã từng vào sẽ giữ JS cũ nếu quên `?v=`:

1. `Stats/stats-view.js` `?v=20 → 21` tại **cả 2 nơi**:
   * `Stats/index.html:63` — `<script src="stats-view.js?v=20">`
   * `client/assets/app.js:1634` — `loadOnce(r + 'Stats/stats-view.js?v=20')`
2. **Và vì bước 1 vừa sửa nội dung `client/assets/app.js`, chính nó phải bump:**
   `assets/app.js?v=42 → 43` tại `client/app.html:81`. Đây là bậc thang mà bản đầu của tài liệu
   bỏ sót: người dùng channel nạp `app.js` từ cache, **rồi mới** để app.js đi nạp stats-view;
   app.js cũ trong cache vẫn trỏ `?v=20` nên bản mới không bao giờ tới nơi. Quy tắc rút ra:
   **bump một file được tham chiếu từ trong một file khác thì file kia cũng đổi, và cũng phải bump.**
3. Chạy `node tests/asset-versions.test.js --update`, commit `tests/asset-versions.json`.
   **Chạy `node tests/asset-versions.test.js` (không cờ) TRƯỚC** — `--update` viết đè manifest
   nên nó sẽ làm im lặng đúng cái lỗi ở bước 2 thay vì báo ra.
4. **Không** sửa CSS ⇒ không bump `stats-view.css`.
5. **Không** thêm file mới ⇒ **không** phải thêm dòng `cp` nào vào `deploy.yml` (test *"every
   versioned asset is one the deploy actually copies"* vẫn xanh).
6. Sửa file bằng công cụ ghi **LF**. Ghi ra CRLF sẽ làm các test đọc source thô
   (`stats-view.test.js` và họ hàng) hỏng theo kiểu rất khó lần.

**Đã chạy thật, theo đúng thứ tự trên** (2026-08-27): `node tests/asset-versions.test.js` → 5/5
xanh **trước** khi regenerate, chứng minh cả ba số đã bump đúng; rồi `--update`; rồi
`node tests/run.js` → 1281/1281.

---

## 7. Kế hoạch test

Không tạo file test mới — bộ lọc thuộc về `tests/film-slicers.test.js`, và file đó đã có sẵn
DOM giả cùng sandbox.

**Sửa sandbox (bắt buộc, nếu không `filmSlicers` sẽ ném `ReferenceError`).** Trong `sandbox()`
(~dòng 123–128) đang lift từng tên một; thêm ba khai báo mới, đặt **trước** `F('filmSlicers')`:

```js
grabConst('FILM_EV_ORDER',STATS,'Stats/stats-view.js'),
grabConst('filmEvRank',STATS,'Stats/stats-view.js'),
grabConst('filmEvCmp',STATS,'Stats/stats-view.js'),
```

`SHARED` đã có sẵn trong sandbox nên `evKey` dùng được ngay.

**Sửa 1 assert cũ.** `tests/film-slicers.test.js:160` hiện là:

```js
eq(byKey(P,'event').opts.map(o=>o.v).join(','),'goal,pass success','alphabetically');
```

Với `CHOICES.events=['goal','pass success']`, kết quả **vẫn là** `goal,pass success` (goal hạng
0, pass success hạng 7) — nghĩa là test này **không đỏ**, nhưng chữ `'alphabetically'` trở thành
một lời nói dối nằm trong source. Đổi thành `'shooting trước distribution'`, và để test thật sự
chứng minh được điều gì, mở rộng theo bảng dưới.

| Nhóm | Case |
|---|---|
| Thứ tự nhóm | `['pass success','goal']` → `goal,pass success` · `['head','foul','tackle success','cross fail','shot on target']` → `shot on target,cross fail,tackle success,foul,head` (đủ 5 nhóm, đầu vào đảo ngược) |
| Trong nhóm | `['pass fail','pass success']` → thành trước bại sau · `['miss shot','goal','key pass']` → `goal,key pass,miss shot` |
| Cái bẫy `block` | `['blocked shot','block']` → `blocked shot` (shooting) **trước** `block` (defensive) — đúng cái A–Z làm ngược |
| Body part cuối bảng | `['right foot','goal','head']` → `goal,right foot,head` |
| Tên lạ | `['zzz custom','goal']` → `goal,zzz custom` · **hai** tên lạ → A–Z với nhau, cả hai đứng sau mọi tên đã biết |
| Hoa/thường | `['Goal','pass success']` → `Goal` đứng đầu, và **giá trị vẫn là `Goal`** (không bị lowercase) |
| Hai cách viết | `['goal','Goal']` → cả hai còn, nằm sát nhau, không gộp |
| Bất biến 1 | với 12 tên trộn ngẫu nhiên: `opts.length` và `new Set(opts.map(o=>o.v))` bằng đúng đầu vào |
| Bất biến 3 | `boxes.length` của slicer event = số tên; tick hết ⇒ `filmFilter.event` về `[]` |
| Bất biến 4 | test cũ *"a pick that this half has no event for is still offered, and still ticked"* xanh nguyên trạng, và lựa chọn mang sang cũng **được xếp đúng hạng** chứ không bị nối vào cuối |
| Xác định | sort hai lần liên tiếp trên cùng mảng ⇒ kết quả y hệt |
| Nguồn | mọi tên trong `FILM_EV_ORDER` viết thường (`evKey(n)===n`) và không trùng lặp (`new Set().size === length`) |
| Không hồi quy | slicer `player` vẫn xếp số học; slicer `team` vẫn `home,away` |

**Toàn bộ suite phải xanh:**

```bash
node tests/run.js
```

17 file test đọc `Stats/stats-view.js` (`stats-view` · `film-*` · `player-data` ·
`report-visuals` · `shooting-goal-map` · `stats-export` · `submit-analysis` · `no-match-tabs` ·
`auth-gate` · `client-channels` · `minutes-played`). Chỉ `film-slicers.test.js` được phép đổi;
16 file còn lại phải xanh **mà không sửa một dòng nào** — đó là bằng chứng mạnh nhất cho yêu cầu
"không vỡ tab khác".

**Kiểm bằng mắt trước khi merge** (2 phút, cả hai host):

1. Trang Stats của tagger → tab Film → mở `All events`: đúng 5 nhóm, không tên nào mất.
2. Channel → một trận có video → Film → tick `goal` + `shot on target` → danh sách bên phải và
   nút ⏭ chỉ nhảy đúng những pha đó (chứng minh giá trị lọc còn khớp).
3. Tick **hết** → nhãn nút quay về `All events` (bất biến 3).
4. Đổi hiệp khi đang tick 2 ô → vẫn tick, vẫn đúng hạng (bất biến 4).
5. Mở tab Stats / Dashboard / Data rồi quay lại Film → không lỗi console.

---

## 8. Rủi ro và phụ thuộc dữ liệu

1. **Bảng tên là bản chụp của từ vựng hôm nay.** Ai đó thêm sự kiện mới ở tagger mà không cập
   nhật `FILM_EV_ORDER` ⇒ nó xuống rổ cuối. Không phải bug, nhưng nên có comment nhắc, và test
   *"mọi tên viết thường, không trùng"* giúp bảng khỏi mục nát âm thầm.
2. **Đổi tên sự kiện ở tagger sau khi đã tag.** Đã là rủi ro sẵn có của app (mọi bảng tra trong
   `shared.js` cũng chịu chung), không tăng thêm.
3. **Sự kiện của môn khác** (`football7`, `futsal`, `basketball` trong `DEFAULT_EVENTS` hiện
   đang rỗng). Khi có, toàn bộ sẽ nằm ở rổ cuối cho tới khi bảng được mở rộng — vẫn dùng được,
   chỉ là chưa nhóm.
4. **Client thấy thứ tự đổi ngay lần tải sau.** Không có cờ bật/tắt; muốn thử nghiệm dần thì
   phải thêm một cơ chế cấu hình — việc lớn hơn hẳn, và không được yêu cầu.

---

## 9. Cố ý KHÔNG làm trong bản này

Ghi ra để không ai tưởng là quên. Mỗi mục là một thay đổi **riêng**, cần được cho phép riêng.

> **Cập nhật 2026-08-27:** 9.1, 9.2 và 9.4 **đã được duyệt và đã làm** — chi tiết ở **§11**.
> Phần văn bản dưới đây giữ nguyên như lúc còn là đề xuất, vì nó là lý do vì sao ba việc đó
> phải tách ra khỏi bản đổi thứ tự chứ không kèm vào. **9.3 vẫn KHÔNG làm.**

### 9.1 Tiêu đề nhóm trong panel

Chèn dòng chữ mờ `SHOOTING` / `DISTRIBUTION` … giữa các nhóm sẽ dễ đọc hơn hẳn. Nhưng nó **đổi
markup của slicer**, mà markup đó đang bị ràng bởi
`boxes=sl.querySelectorAll('.fm-sl-opt input[value]')` (ngưỡng "tick hết"), `filmSlicerFit()`
(chiều cao panel, `FILM_SL_MAX=230`), và một loạt assert về DOM trong `film-slicers.test.js`.
Làm được, nhưng phải có test riêng cho từng cái. **Không kèm vào đây.**

### 9.2 Gộp/ẩn nhóm, ô "chọn cả nhóm"

"Tick một phát ra toàn bộ Shooting" là tính năng mới, không phải thứ tự.

### 9.3 Đổi thứ tự ở nơi khác

Bảng sự kiện trong tagger, thứ tự hotkey, thứ tự cột Stats/Data/report — **giữ nguyên**.

### 9.4 Sửa chính tả `take-on succes` / `gain possesion`

Đúng là nên sửa, nhưng sửa tên sự kiện là **đụng vào dữ liệu đã tag** ở mọi trận cũ (`EVENT_INC`
tra theo tên). Đó là một thay đổi có migration, không phải một thay đổi thứ tự. Bảng ở §3.2 chứa
**cả hai** cách viết, nên khi nào bạn quyết định sửa thì bộ lọc vẫn đúng ngay.

---

## 10. Quyết định đã chốt

1. Thứ tự = **shooting → distribution → defensive → other → body part**, đúng như yêu cầu, và
   trùng khớp với `PLAYER_CATS` đã có.
2. Bảng tên **tường minh** trong `Stats/stats-view.js`; không suy diễn lúc chạy.
3. Trong nhóm: theo thứ tự cột của `PLAYER_CATS`, thành trước bại sau.
4. Tên lạ **không bao giờ mất** — xuống rổ cuối, A–Z.
5. Tra hạng qua `evKey`; **giá trị lọc giữ nguyên chuỗi thô**.
6. Sửa **cả hai** chỗ `.sort()` để file chỉ có một câu trả lời.
7. `shared.js` **không** bị đụng ⇒ chỉ một file phải bump `?v=`, ở hai nơi.
8. Chỉ `tests/film-slicers.test.js` được sửa; 16 file test còn lại phải xanh nguyên trạng.

**Q2 và Q4 đã được chốt đúng như đề xuất (2026-08-27): `assist` / `key pass` nằm ở shooting, và
body part xếp right foot · left foot · upper body · head · lower body.** Code đã theo đúng hai
quyết định đó.

### Kết quả đo trên bộ từ vựng thật

Đưa **44 tên** — 35 sự kiện mặc định của tagger + `key pass` + `assist` + 4 body part +
`throw-Ins` (đúng chính tả của tagger) + một tên tự đặt `Custom Event` — vào bộ lọc theo thứ tự
A–Z, kết quả ra:

```
goal · assist · key pass · shot on target · shot off target · blocked shot
pass success · pass fail · cross success · cross fail · take-on succes · take-on fail · step in
tackle success · tackle fail · interception · clearance · block · recovery
  · ground duel success · ground duel fail · aerial duel success · aerial duel fail
  · take-on concern · mistake
corner-kick · free-kick · throw-Ins · goal kick · foul · foul throw · handball foul
  · offside · save · yellow card · red card · substitution · gain possesion · pause
right foot · left foot · upper body · head
Custom Event
```

44 vào, 44 ra. `throw-Ins` xếp đúng chỗ của một quả ném biên dù viết hoa chữ I (tra qua `evKey`),
và `Custom Event` — tên bảng chưa từng nghe — vẫn được cung cấp, nằm ở cuối.

---

## 11. Bản sửa 2 — §9.1, §9.2 và §9.4 đã làm (2026-08-27)

Ba mục §9 để ngỏ nay đã được duyệt và triển khai. **§9.3 vẫn không làm.**
`node tests/run.js` → **1298/1298 passed**, trong đó **1281 test cũ pass** và **17 test mới**.

| | Việc | Kết quả |
|---|---|---|
| **9.1** | Tiêu đề nhóm trong panel | `SHOOTING` · `DISTRIBUTION` · `DEFENSIVE` · `OTHER` · `BODY PART` · `OTHER EVENTS` |
| **9.2** | Tick cả nhóm một phát | Chính cái tiêu đề đó là ô tick |
| **9.4** | Sửa chính tả 2 tên | `take-on success`, `gain possession` — **không migration, không mất một dòng dữ liệu nào** |

### 11.1 §9.4 — gấp hai chính tả về một tên, ở đúng một chỗ

Vấn đề thật: danh sách sự kiện xuất xưởng sai chính tả suốt nhiều tháng, nên **dữ liệu đã tag
mang chính tả cũ**, còn danh sách từ nay mang chính tả mới. Đổi khoá từ điển mà không làm gì
thêm = mọi trận cũ đọc ra 0 take-on, im lặng, đúng kiểu sự cố "Throw-ins đọc ra 0" hồi
2026-07-24.

Cách làm: **một bảng alias ngay tại `evKey`** trong `shared.js`.

```js
const EV_ALIAS={'take-on succes':'take-on success','gain possesion':'gain possession'};
const evKey=e=>{const k=String(e==null?'':e).trim().toLowerCase();
  return EV_ALIAS[k]||k;};
```

Vì sao ở đây chứ không phải thêm khoá vào từng từ điển:

* `evKey` là **điểm duy nhất** mà mọi tra cứu trong `shared.js`, `Stats/stats-view.js` và
  `Stats/report.js` đã đi qua — kỷ luật có sẵn từ lần sửa lỗi throw-Ins. Sửa một chỗ, cả ba
  file được theo.
* Hai chỗ **không thể** chứa hai chính tả: `DIST_CATS.takeons` (Stats) và `TAKEON_RANKS`
  (report) đọc `parts[0]` là "sự kiện thắng"; thêm một mục nữa bên cạnh sẽ bị hiểu thành một
  **loại thứ ba**, và cột Succ. / % của bảng xếp hạng sai theo. Alias tránh hẳn chuyện đó —
  hai file này **không phải sửa một dòng logic nào**, chỉ đổi chuỗi cho sạch.
* Đổi lại: alias là **vô hình trong dữ liệu**, không có gì để "gỡ gấp" về sau. Nên có luật kèm
  theo, viết ngay trong comment và có test canh: **chỉ được gấp hai cách viết của CÙNG một sự
  kiện**, không bao giờ gấp hai sự kiện khác nhau.

Tagger `index.html` **không nạp `shared.js`** — nó giữ bản sao riêng của cả bộ máy thống kê —
nên bản sao `EV_ALIAS` + `evKey` được đặt cạnh `computeStats` của nó, thay cho dòng
`String(...).trim().toLowerCase()` viết thẳng. Không có bước này thì tab Stats của chính tagger
đọc ra 0 cho mọi trận cũ.

**Ba chỗ khác mang tên sự kiện, và cách xử lý từng chỗ:**

1. `DEFAULT_EVENTS` (index.html) + `pitchtagger_events.json` → **đổi sang chính tả đúng**. Chỉ
   ảnh hưởng trình duyệt chưa từng mở app; người đang dùng giữ danh sách trong localStorage,
   và nhờ alias, họ **đổi tên bằng tay lúc nào cũng an toàn** — đó chính là thứ §9.4 mua được.
2. `Stats/stats-view.js` DIST_CATS + `Stats/report.js` TAKEON_CAT/RANKS → đổi chuỗi sang chính
   tả đúng. Cả hai đi qua `evKey` nên **hành vi không đổi một ly**; đây thuần tuý là dọn chính
   tả khỏi source.
3. **`supabase/migrations/0015_match_stats_event_names.sql`** — view `match_stats` khớp tên sự
   kiện **bằng SQL**, nơi `evKey` không với tới. May mắn: nó **đã** khớp cả hai chính tả từ
   trước (`ev in ('take-on succes','take-on success','take-on fail')`), nên **không phải sửa,
   và migration đã chạy thì không được sửa**. Chỉ có `tests/client-channels.test.js` phải đổi
   chiều: bộ `allowed` giờ liệt kê chính tả **cũ** là ngoại lệ, thay vì chính tả mới. Test này
   là thứ bắt được vấn đề — nó so mọi tên trong view với danh sách xuất xưởng.

**Bằng chứng mạnh nhất:** 6 file test đang tag dữ liệu bằng `take-on succes`
(`analysis-gate` · `events-table` · `report-visuals` · `stats-distribution` ×2 …) **pass nguyên
trạng, không sửa một dòng**. Nếu alias không hoạt động, chúng đỏ trước tiên.

### 11.2 §9.1 + §9.2 — tiêu đề nhóm, và chính nó là ô tick

Bảng thứ tự phẳng được xếp lại thành `FILM_EV_GROUPS` (tên nhóm → danh sách tên), còn
`FILM_EV_ORDER` **suy ra** từ nó bằng một `reduce`. Một bảng, hai việc: thứ tự và nhóm **không
thể** bất đồng về chỗ đặt tiêu đề. `filmEvGroup(e)` đọc cùng bảng đó.

`filmSlicers` gắn `grp` vào từng option **chỉ của slicer event**; hai slicer kia không mang
`grp` nên không sinh tiêu đề nào — hai đội và một dãy số áo không có gì để nhóm.
`filmSlicerHTML` mở một tiêu đề mỗi khi `grp` đổi.

**Toàn bộ lập luận an toàn nằm ở một dòng markup:** tiêu đề là `.fm-sl-head`, **không bao giờ**
`.fm-sl-opt`, và **không mang `value`**. Ba thứ đếm option từ panel này:

| Đọc bằng | Ai đọc | Nếu tiêu đề lọt vào |
|---|---|---|
| `.fm-sl-opt input[value]` | ngưỡng "tick hết = không tick" | ngưỡng lệch, **vĩnh viễn không với tới** |
| `.fm-sl-opt input` | binder gắn `onchange` | tiêu đề chạy nhầm nhánh của option |
| `.fm-sl-opt input` | `filmSyncSlicer` | tiêu đề bị set `checked` theo `sel.indexOf(undefined)` |

Ba test cuối của mục này chính là lập luận đó, đo bằng số: 4 option · 5 (kèm All) · 3 tiêu đề —
và một test riêng chứng minh **tick tay đủ mọi option vẫn về được All**.

Ô tick nhóm tuân đúng hai luật của ô tick lẻ, để chỉ có **một** trạng thái phải đọc dù người
dùng bấm bằng đường nào: **cộng thêm** vào cái đang chọn (không thay thế), và **tick hết thì
chuẩn hoá về rỗng** = "All events". Tiêu đề sáng đúng khi mọi option dưới nó được chọn —
`filmSyncSlicer` đọc ngược lại từ DOM sau mỗi lần tick, nên tick tay nốt ô cuối của một nhóm
cũng làm tiêu đề sáng lên.

Tên lạ có tiêu đề riêng — `OTHER EVENTS` — nên một danh sách sự kiện tự đặt cũng dùng được ô
tick nhóm, y như bộ xuất xưởng.

### 11.3 Đo trên bộ từ vựng thật

44 tên vào (gồm cả `take-on succes`, `gain possesion`, `throw-Ins` viết theo kiểu tagger, và
một `Custom Event`), panel dựng ra:

```
[ ] All events
  -- SHOOTING --      goal · assist · key pass · shot on target · shot off target · blocked shot
  -- DISTRIBUTION --  pass success · pass fail · cross success · cross fail
                      · take-on succes · take-on fail · step in
  -- DEFENSIVE --     tackle success · tackle fail · interception · clearance · block · recovery
                      · ground duel … · aerial duel … · take-on concern · mistake
  -- OTHER --         corner-kick · free-kick · throw-Ins · goal kick · foul · foul throw
                      · handball foul · offside · save · yellow card · red card
                      · substitution · gain possesion · pause
  -- BODY PART --     right foot · left foot · upper body · head
  -- OTHER EVENTS --  Custom Event

51 input = 1 All + 44 option + 6 tiêu đề
```

Chú ý dòng `take-on succes` và `gain possesion`: chúng **vẫn hiện đúng chuỗi đã tag** — giá trị
lọc phải khớp tuyệt đối với `r.event` — nhưng **được xếp đúng nhóm** nhờ alias. Đó chính là
ranh giới của §4.4, nay áp cho cả nhóm chứ không riêng thứ tự.

### 11.4 Phạm vi và cache-bust của bản sửa 2

| File | Thay đổi |
|---|---|
| `shared.js` | +`EV_ALIAS`, `evKey` tra qua nó; `EVENT_INC` đổi khoá sang chính tả đúng |
| `index.html` (tagger) | bản sao `EV_ALIAS`+`evKey` cạnh `computeStats`; `EVENT_INC` đổi khoá; `DEFAULT_EVENTS` sửa 2 tên |
| `pitchtagger_events.json` | sửa 2 tên |
| `Stats/stats-view.js` | `FILM_EV_GROUPS`/`FILM_EV_REST`/`filmEvGroup`; `grp` trong `filmSlicers`; tiêu đề trong `filmSlicerHTML`; nhóm trong `filmSyncSlicer` + `filmBindSlicers`; DIST_CATS đổi chuỗi |
| `Stats/stats-view.css` | `.fm-sl-head` · `.fm-sl-gtxt` + hai dòng cho toàn màn hình |
| `Stats/report.js` | TAKEON_CAT + TAKEON_RANKS đổi chuỗi (hành vi không đổi) |
| `client/demo-film.html` | 1 comment đã lỗi thời — **file này nằm ngoài repo** (`.git/info/exclude`), nên sửa chỉ có trên máy |
| `tests/harness.js` | xuất thêm `EV_ALIAS` |
| `tests/film-slicers.test.js` | stub biết tiêu đề; +13 test |
| `tests/event-name-case.test.js` | +4 test cho alias |
| `tests/client-channels.test.js` | bộ `allowed` đổi chiều |

**Cache-bust — bốn asset, chín con số:**

1. `shared.js` `21 → 22`: `Stats/index.html:62`, `Player-Lists/index.html:98`, `client/assets/app.js:1623`
2. `Stats/stats-view.js` `21 → 22`: `Stats/index.html:63`, `client/assets/app.js:1634`
3. `Stats/stats-view.css` `8 → 9`: `Stats/index.html:12`, `client/assets/app.js:1631`
4. `Stats/report.js` `34 → 35`: `Stats/index.html:72`, `client/assets/app.js:1635`
5. …và vì cả bốn tham chiếu trên **nằm trong** `client/assets/app.js`, chính nó bump
   `43 → 44` tại `client/app.html:81` — đúng bậc thang §6 bước 2.

Chạy `node tests/asset-versions.test.js` **không cờ** trước: 5/5 xanh, chứng minh chín con số
đã đúng; rồi mới `--update`.

### 11.5 Không đụng tới trong bản sửa 2 (0 dòng)

`cloud-sync.js` · `supabase/migrations/*` (0015 đã khớp cả hai chính tả, và migration đã chạy
thì không sửa) · `worker/*` · `client/index.html` · `client/guide.html` · `client/login.html` ·
`Player-Lists/*` (ngoài một con số `?v=`) · `auth.js` · `.github/workflows/deploy.yml` · cổng
phân tích `DUEL_MIRRORS` trong tagger (nó **vốn đã** nhận cả hai chính tả) · thứ tự sự kiện ở
tagger, hotkey, macro, và thứ tự cột Stats/Data/report (**§9.3, không được duyệt**).
