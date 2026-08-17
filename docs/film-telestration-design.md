# Film — Telestration & Clipping — Detailed Design

**Trong chế độ toàn màn hình ở channel, bấm chuột phải lên khung hình sẽ mở một bảng công cụ
dành cho performance analyst: đứng hình chính xác tới frame, rọi đèn và làm tối phần còn lại,
vẽ mũi tên và vùng, kẻ vạch việt vị và đo cự ly đội hình bằng mét thật, cắt clip và xếp thành
playlist, xuất ảnh và xuất clip có đồ hoạ đã "burn" vào. Tài liệu này mô tả toàn bộ hệ thống
đó — cái gì làm được, cái gì làm được nhưng đắt, cái gì không làm được và vì sao.**

Trạng thái: **Tier 1 đã triển khai** (2026-08-17). Q1→B · Q2→A · Q3→A · Q4→A · Q5→bỏ.
Bản sửa 2: **clip xuất ra là video THẬT, tải về máy analyst, và không một byte video nào được
tải lên Cloudflare** — xem §0.1 và §10.

Phạm vi đã làm: `client/assets/film-tools.js` (mới, ~1 100 dòng — **chỉ channel nạp**),
`client/assets/film-tools.css` (mới), `tests/film-tools.test.js` (mới, 28 test),
`Stats/stats-view.js` (**+40 / −0**, trong đó **5 dòng** chạm vào hàm sẵn có, mỗi dòng là
`if(filmTools)…` và no-op khi không có companion), `client/assets/app.js` (nạp + đăng ký),
`.github/workflows/deploy.yml` (2 dòng `cp` cho 2 file mới),
`tests/asset-versions.test.js` (dạy nó cách app.js trỏ vào thư mục của chính nó).

**0 dòng** ở: `shared.js`, `shared.css`, `Stats/stats-view.css`, `Stats/report.js`,
`cloud-sync.js`, `index.html` (tagger), `Player-Lists/*`, `worker/*`, `supabase/*`,
`client/index.html`, `client/login.html`, `client/assets/app.css`.

Test: `node tests/run.js` → **1074/1074 passed**, trong đó **1046 test cũ pass nguyên vẹn**.

> **Q4 không được trả lời, đã đi theo (A)** — phương án 0 dependency: Firefox chỉ ghi được
> WebM, và analyst được **nói thẳng** điều đó thay vì nhận một file HLV không mở nổi. Đổi sang
> (B) sau này chỉ là thay `pickMime()` và thêm một muxer, không phá gì.

> **Hai chỗ Tier 1 chưa đầy đủ, nói rõ ở §19.3:** playlist mới có thêm/xoá/phát/tải chứ chưa
> có đổi thứ tự, đổi tên, ghi chú và tag; và **"chia sẻ cho cầu thủ" không làm được ở Tier 1** —
> Q2 chọn `localStorage`, mà `localStorage` là của riêng một trình duyệt. Chia sẻ cần hai bảng
> Supabase ở §12, tức là Tier 2.

---

## 0. Trả lời thẳng câu hỏi

> *"Liệu phần mềm có thể có chức năng giúp cho performance analyst cắt ghép và sử dụng
> Graphics & Telestration không?"*

**Telestration: được, gần như trọn vẹn, và không cần thêm hạ tầng nào.** Kể cả vạch việt vị
theo phối cảnh 3D — thứ nghe như phải mua CoachPaint. Lý do ở §3: CoachPaint cũng calibrate
bằng tay, và phép toán đằng sau nó (homography, một ma trận 3×3 giải từ 4 điểm) là **~40 dòng
JavaScript, không thư viện**. Sân trong repo này đã là 1050×680 đơn vị cho 105×68 mét, tức
**1 đơn vị = 1 decimet**, nên "đo bằng mét" chỉ là một phép chia 10.

**Cắt ghép ra file thật, tải về máy, không tốn một đồng lưu trữ nào: được.** Không phải "về lý
thuyết được" — cả chuỗi đã được chạy thử trong trình duyệt và đo lại ở §18. Hệ thống có hai
hình thức clip, và **cả hai đều cần**, cho hai việc khác nhau:

| | Là gì | Dùng khi | Giá |
|---|---|---|---|
| **Clip ảo** | một cặp `(t_in, t_out)` trỏ vào đúng file cũ | xem **trong** app: dựng giáo án, họp đội, chia sẻ cho cầu thủ | gần như miễn phí — Film đã làm đúng việc đó cho hai hiệp (`filmWindows`/`filmEnd`) |
| **Clip thật** | một file `.mp4` mới, đồ hoạ đã burn vào, **nằm trên ổ đĩa của analyst** | mang **ra ngoài** app: gửi CLB khác, WhatsApp, PowerPoint, tuyển trạch | thời gian render, và **0 đồng lưu trữ** |

### 0.1 Bốn ràng buộc bạn đặt ra, và cách từng cái được đáp ứng

| Yêu cầu | Cách đáp ứng | Bằng chứng |
|---|---|---|
| **Video thật, tải xuống được** | canvas → `MediaRecorder` → Blob → ổ đĩa. Đã render thử: file **MP4/H.264 hợp lệ**, header `ftyp isom …avc1`, `canPlayType` = "probably" | §18.2 |
| **Không lưu trên Cloudflare** | **không có một lời gọi upload nào trong thiết kế.** Blob đi thẳng từ RAM ra ổ đĩa qua `showSaveFilePicker()`. Không R2 PUT, không Supabase Storage | §10.3 |
| **Không ảnh hưởng video gốc** | app channel **không nạp `cloud-sync.js`**, nên `uploadToR2()` và `setVideoUrl()` **không tồn tại** trong trang đó. Không có đường code nào để ghi | §11.2 |
| **Cầu thủ & coach xem như thường** | lớp đồ hoạ là **opt-in**: không mở clip thì không vẽ gì. Đường đi mặc định qua channel không đổi một byte | §11.3 |

Điểm mấu chốt khiến ràng buộc "không lưu trên cloud" **làm kiến trúc đơn giản đi chứ không phức
tạp thêm**: bỏ upload là bỏ luôn cả một chuỗi vấn đề — quota, quyền ghi, dọn file cũ, link hết
hạn, ai trả tiền cho clip của ai. Quan hệ giữa trình duyệt và Cloudflare trở thành **chỉ đọc,
một chiều, vĩnh viễn.**

Còn về chi phí đọc: render một clip 12 giây **không tải cả trận về**. `<video>` dùng HTTP range
request, chỉ lấy đúng khúc byte nó phát — đúng bằng lượng dữ liệu của một lần xem clip đó. Và
R2 **không tính phí egress**. Nên render một clip tốn đúng bằng xem nó một lần: **0.**

**Cái KHÔNG làm được** (không phải "chưa làm", mà là không nên hứa): tự động nhận diện và bám
cầu thủ bằng thị giác máy tính. Mọi thứ trong tài liệu này là **analyst chỉ vào đâu thì máy
tính ở đó**. Đó cũng là cách các phần mềm telestration phổ thông hoạt động; cái tự động là sản
phẩm khác, hạng khác (Second Spectrum, Hawk-Eye), và cần dữ liệu tracking chứ không cần một
tính năng.

---

## 1. Vì sao là chuột phải, và vì sao chỉ trong toàn màn hình

Film hôm nay có một luật đã ghi trong CSS:

> `stats-view.css:254` — *"no cursor:pointer — the surface takes no click, Space is play/pause"*

Mặt video **không nhận click trái**, cố ý: đang xem một pha bóng mà lỡ tay click là mất chỗ.
Luật đó phải giữ nguyên. **Chuột phải là một sự kiện khác** (`contextmenu`), không tranh chấp
gì với nó — nên nó là chỗ trống tự nhiên duy nhất còn lại trên khung hình.

Ba lý do nữa khiến chuột phải là đúng chỗ:

1. **Menu xuất hiện tại đúng điểm được hỏi.** Toàn bộ công cụ ở đây đều là "làm gì đó **ở chỗ
   này**": rọi đèn vào chỗ này, đo từ chỗ này, kẻ vạch việt vị qua cầu thủ ở chỗ này. Một
   toolbar ở mép màn hình vứt đi mất thông tin toạ độ mà cú bấm đã mang theo.
2. **Toàn màn hình không còn chỗ cho toolbar.** Cả thiết kế trước
   ([film-fullscreen-design.md](film-fullscreen-design.md)) dựa trên việc viewport là ngân sách
   và không có gì được cuộn. Thêm một hàng nút là lấy chiều cao khỏi khung hình.
3. **Analyst đang cầm chuột chứ không cầm cảm hứng.** Menu ngữ cảnh + phím tắt là cách làm
   việc của mọi phần mềm phân tích.

Và vì sao **chỉ** trong toàn màn hình: ở cỡ thường khung hình rộng 1312px (đo ở §17 của tài
liệu trước) — vẽ một mũi tên chính xác lên đó đã khó, còn kẻ vạch việt vị qua chân một cầu thủ
cao 40px thì không nghiêm túc. Toàn màn hình cho 1430×951, và đó là ngưỡng làm việc được. Nó
cũng giữ cho bề mặt thay đổi hẹp lại: **một chế độ, một cửa vào.**

---

## 2. Ranh giới

**Làm:**
- menu chuột phải trên `#fmStage`, chỉ khi `.film-full` đang bật
- đứng hình chính xác tới frame, bước từng frame, tốc độ chậm
- lớp vẽ (telestration) neo vào **hình**, không neo vào khung
- calibrate sân → mọi thứ đo bằng mét, vạch việt vị, cự ly đội hình
- clip ảo + playlist, lưu vào channel, chia sẻ cho cầu thủ
- xuất PNG một frame có đồ hoạ
- xuất clip thật (tier 3), có đồ hoạ burn vào

**Không làm (§15):** tự động bám cầu thủ, tự dò vạch sân, ghép nhiều **trận** vào một file,
chỉnh màu/âm thanh, và bất cứ thứ gì đòi một máy chủ xử lý video.

---

## 3. Ba hệ toạ độ — phần cốt lõi của cả tài liệu

Mọi công cụ ở đây rơi vào đúng một trong ba hệ, và **hệ nào quyết định công cụ đó khó tới đâu**.
Nhầm hệ là nguồn gốc của mọi lỗi lệch chỗ trong loại phần mềm này.

| Hệ | Đơn vị | Neo vào | Cần calibrate? | Ví dụ |
|---|---|---|---|---|
| **S — screen** | 0..1 theo *chiều rộng/cao của HÌNH* | một điểm trên khung hình | không | mũi tên, chữ, khoanh tròn, tô vùng |
| **P — pitch** | decimet (1050×680) | một điểm trên **mặt sân thật** | **có** | vạch việt vị, đo mét, cự ly đội hình |
| **T — tracked** | S theo thời gian | một **cầu thủ**, qua nhiều frame | không (nhưng cần keyframe) | vòng tròn chạy theo hậu vệ biên |

### 3.1 Hệ S phải neo vào HÌNH, không phải vào khung

Đây là cái bẫy dễ mất nhất, và thiết kế toàn màn hình vừa rồi làm nó lộ ra rõ mồn một:

```
.film-stage  1430 × 951      ← khung
<video>      object-fit:contain
hình thật    1430 × 804      ← 16:9 nằm giữa, còn 147px dải đen chia đôi trên/dưới
```

Một mũi tên lưu theo toạ độ **khung** sẽ trượt xuống 73px so với cỏ ngay khi cửa sổ đổi tỉ lệ —
và tệ hơn: cùng một bản vẽ mở trên máy khác, tỉ lệ khác, sẽ nằm ở chỗ khác. Nên:

```js
// hình thật nằm ở đâu bên trong khung — tính từ videoWidth/videoHeight, không đoán
function pictureRect(v){
  const box=v.getBoundingClientRect();
  const ar=v.videoWidth/v.videoHeight, boxAr=box.width/box.height;
  const w=ar>boxAr?box.width:box.height*ar;
  const h=ar>boxAr?box.width/ar:box.height;
  return {x:box.x+(box.width-w)/2, y:box.y+(box.height-h)/2, w:w, h:h};
}
```

Lớp SVG vẽ được đặt **đúng chồng lên `pictureRect`**, với `viewBox="0 0 1000 1000"` và
`preserveAspectRatio="none"`, nên mọi toạ độ lưu là 0..1000 trên hình. Một bản vẽ khi đó **độc
lập hoàn toàn với kích thước cửa sổ, với toàn màn hình, và với máy của người xem.**

### 3.2 Hệ P: homography, và vì sao nó không đáng sợ

Camera đặt cao và nghiêng, nên mặt sân trong hình là một hình thang chứ không phải hình chữ
nhật. Phép biến đổi giữa "mặt phẳng sân" và "mặt phẳng ảnh" là một **homography** — ma trận
3×3, 8 bậc tự do, giải được **chính xác** từ 4 cặp điểm tương ứng:

```
[x']   [h11 h12 h13] [X]                    X,Y : toạ độ sân (decimet)
[y'] = [h21 h22 h23] [Y]        x = x'/w'   x,y : toạ độ hình (0..1000)
[w']   [h31 h32  1 ] [1]        y = y'/w'
```

4 cặp điểm → hệ 8 phương trình 8 ẩn → giải bằng khử Gauss. **Không cần thư viện, không cần
WebGL, ~40 dòng.** Đảo ngược một ma trận 3×3 cũng vậy.

**Analyst chỉ vào 4 điểm mà sân bóng nào cũng có** — và đây là chỗ dữ liệu sân sẵn có trong
`shared.js` trả công: `PITCH_DIMS`, `pitchFootball()` đã biết chính xác mọi vạch nằm ở đâu
trong 1050×680, nên các mốc gợi ý được liệt kê sẵn kèm toạ độ:

| Mốc | Toạ độ sân (decimet) |
|---|---|
| Góc sân trái-trên | `(0, 0)` |
| Giao vạch 16m50 với biên dọc, bên trái | `(0, 340 ± 201.6)` |
| Góc vòng cấm trái-trên | `(165, 138.4)` |
| Giao vạch giữa sân với biên dọc trên | `(525, 0)` |
| Tâm vòng tròn giữa sân | `(525, 340)` |
| …và bản đối xứng của tất cả |

Càng nhiều điểm càng tốt: từ 5 điểm trở lên dùng **least-squares (DLT)** thay vì giải đúng, và
báo lại **sai số reprojection tính bằng cm** — analyst thấy ngay mình chỉ lệch hay không, thay
vì tin một vạch việt vị sai mà không biết.

### 3.3 Cái làm hệ P trở nên khả thi: đứng hình VÀ calibrate là **cùng một khoảnh khắc**

Đây là quyết định thiết kế quan trọng nhất của tài liệu.

Một homography chỉ đúng cho **một vị trí camera**. Camera truyền hình pan và zoom liên tục, nên
"calibrate cả trận" là bất khả thi nếu không dò vạch sân tự động.

Nhưng hãy hỏi: **khi nào người ta thực sự cần vạch việt vị?** Khi đang **đứng hình**. Không ai
kẻ vạch việt vị trên video đang chạy — chính người dùng đã mô tả như vậy ở mục 1: dừng đúng
millisecond tiền vệ chuẩn bị chuyền, rồi mới nói chuyện khoảng trống.

Vậy nên: **một calibration thuộc về một freeze-frame**, không thuộc về trận đấu. Nó được đo
đúng lúc nó đúng, dùng đúng lúc nó đúng, và lưu kèm cái freeze đó. Bài toán khó biến mất, không
phải bằng cách né, mà vì nó chưa bao giờ là bài toán thật.

Hai đường tắt cho trường hợp dễ, cả hai là *thêm*, không phải *thay*:

- **Camera tactical cố định** (rất nhiều CLB quay từ một giàn cố định trên khán đài): một
  calibration dùng cho cả hiệp. Hệ thống tự đề nghị tái dùng, kèm nút "sân đã lệch, đo lại".
- **Kế thừa**: một freeze mới trong vòng ±N giây của một freeze đã calibrate thì mượn tạm ma
  trận đó và **nói rõ là đang mượn** (viền vàng), cho tới khi analyst xác nhận hoặc đo lại.

### 3.4 Món quà rơi ra từ calibration

Khi đã có `H`, mọi event đã tag đều **chiếu ngược lên được khung hình thật**. `pXY`/`rXY` của
mỗi row đang là phần trăm của sân, tức đã nằm sẵn trong hệ P:

```js
const pitch={X:r.pXY.x/100*1050, Y:r.pXY.y/100*680};
const px=applyH(Hinv,pitch);        // → toạ độ trên hình
```

Nghĩa là: chấm mà analyst đã đặt trên sân nhỏ lúc tag **hiện lên đúng chỗ trên cỏ thật**,
đường chuyền nét đứt vẽ đúng trên mặt sân theo phối cảnh. Không ai đặt hàng tính năng này; nó
rơi ra miễn phí từ ma trận đã có, và nó là thứ gây ấn tượng nhất trong một buổi họp đội.

---

## 4. Danh mục đầy đủ công cụ cho performance analyst

Tier: **1** = lõi, không cần calibrate · **2** = cần calibrate · **3** = cần encode/hạ tầng thêm.

### 4.1 Thời gian & sự chú ý

| # | Công cụ | Analyst dùng để làm gì | Hệ | Tier |
|---|---|---|---|---|
| 1 | **Freeze chính xác tới frame** | dừng đúng frame tiền vệ *chuẩn bị* chuyền, không phải frame bóng đã tới | — | 1 |
| 2 | **Bước ±1 frame** (`,` `.`) | dò đúng cái frame ấy | — | 1 |
| 3 | **Tốc độ 0.25× / 0.5× / 1× / 1.5× / 2×** | xem lại pha xử lý một chạm | — | 1 |
| 4 | **Tua ngược chậm** | đọc lại chuyển động phòng ngự | — | 1 |
| 5 | **A↔B loop** | lặp một pha 6 giây mười lần trong khi nói | — | 1 |
| 6 | **Nhảy tới event kế/trước** | bám theo `#fmList` sẵn có | — | 1 |
| 7 | **Dim nền** (làm tối toàn bộ trừ vùng chọn) | ép mắt vào một chỗ — kỹ thuật "Aha!" | S | 1 |
| 8 | **Spotlight** (tròn/ellipse, có thể nhấp nháy) | cô lập một cá nhân | S / T | 1 |
| 9 | **Zoom & pan vào một vùng** | phóng to góc xa của khung hình | S | 1 |
| 10 | **Ẩn/hiện toàn bộ lớp vẽ** (`H`) | "đây là điều các bạn thấy" → "đây là điều thật sự xảy ra" | — | 1 |

### 4.2 Đồ hoạ (Telestration)

| # | Công cụ | Dùng để | Hệ | Tier |
|---|---|---|---|---|
| 11 | **Mũi tên thẳng** | hướng chuyền, hướng chạy | S | 1 |
| 12 | **Mũi tên cong** (Bézier 1 điểm điều khiển) | đường chạy vòng, chuyền vòng cung | S | 1 |
| 13 | **Mũi tên nét đứt** | chạy không bóng — quy ước phổ thông | S | 1 |
| 14 | **Bút tự do** | khoanh nhanh khi đang nói | S | 1 |
| 15 | **Chữ nhật / đa giác tô màu** | half-space, pocket, vùng bẫy | S | 1 |
| 16 | **Nhãn chữ** | "GK+4", "áp sát chậm 1.2s" | S | 1 |
| 17 | **Marker cầu thủ** (chevron/nón dưới chân) | đánh dấu người mà không che mất họ | S / T | 1 |
| 18 | **Nón tầm nhìn / bóng che đường chuyền** (hình quạt từ một cầu thủ) | minh hoạ cầu thủ đang cắt đường chuyền nào | S | 1 |
| 19 | **Bám cầu thủ qua keyframe** | vòng tròn chạy theo hậu vệ biên suốt 5 giây | T | 2 |
| 20 | **Lưới sân** (ba tuyến dọc/ngang, hoặc 18 ô của `zoneAt`) | nói chuyện bằng ngôn ngữ vùng sẵn có của hệ thống | P | 2 |

### 4.3 Đo đạc — phần đòi calibration

| # | Công cụ | Dùng để | Hệ | Tier |
|---|---|---|---|---|
| 21 | **Vạch việt vị** | chứng minh việt vị sát nút; kiểm tra hàng thủ có dâng đồng bộ không | P | 2 |
| 22 | **Đo khoảng cách hai điểm (mét)** | "anh đứng cách người kèm 9.4m" | P | 2 |
| 23 | **Cự ly đội hình dọc** (tiền đạo↔hậu vệ) | đo độ dài đội hình; **đỏ >30m, vàng 20–30m, xanh <20m** | P | 2 |
| 24 | **Cự ly ngang giữa các cầu thủ một tuyến** | khoảng cách hàng 4 người có đều không | P | 2 |
| 25 | **Khối phòng ngự (convex hull)** của một nhóm | diện tích khối, tính bằng m² | P | 2 |
| 26 | **Trọng tâm đội hình** | đội đang bị đẩy về bên nào | P | 2 |
| 27 | **Vòng tròn bán kính X mét** quanh một điểm | "5m áp sát" trông thực tế là bao xa | P | 2 |
| 28 | **Hành lang/kênh** (dải song song với biên dọc) | half-space đúng theo mét, không phải ước lượng | P | 2 |
| 29 | **Chiếu event đã tag lên khung hình** (§3.4) | chấm và đường chuyền đã tag, đặt lên cỏ thật | P | 2 |

### 4.4 Cắt ghép & phân phối

| # | Công cụ | Dùng để | Tier |
|---|---|---|---|
| 30 | **Mark in / Mark out** (`[` `]`) | cắt một clip ảo | 1 |
| 31 | **Clip từ event** (±N giây quanh một cue trong `#fmList`) | biến 1 300 event đã tag thành 1 300 clip có sẵn | 1 |
| 32 | **Playlist**: thêm, đổi thứ tự, đổi tên, ghi chú, tag | dựng giáo án buổi họp | 1 |
| 33 | **Phát playlist liên tục**, tự nhảy clip, có đếm ngược | chạy cả buổi họp không rời tay khỏi phím cách | 1 |
| 34 | **Thẻ tiêu đề giữa các clip** | "PHÒNG NGỰ CHUYỂN TRẠNG THÁI — 4 tình huống" | 1 |
| 35 | **Chia sẻ playlist cho channel** | cầu thủ mở điện thoại xem được | 1 |
| 36 | **Link tới đúng một khoảnh khắc** (`#/match/x?t=1234.56`) | dán vào tin nhắn | 1 |
| 37 | **Xuất PNG một frame** có đồ hoạ | chèn vào slide, vào báo cáo PDF | 1 |
| 38 | **Xuất MỘT clip thật** (.mp4) có đồ hoạ burn vào, tải thẳng về máy | gửi ra ngoài hệ thống | **1** |
| 39 | **Ghép NHIỀU đoạn thành một file .mp4** kèm thẻ tiêu đề giữa các đoạn | một file duy nhất cho cả buổi họp, gửi được qua WhatsApp | **2** |
| 40 | **Ghép đoạn từ NHIỀU trận** vào một file | "sáu lần thủng lưới từ phạt góc, bốn trận" | 2 |
| 41 | **Chọn độ phân giải / bitrate khi xuất** | 1080p cho máy chiếu, 720p cho tin nhắn | 2 |
| 42 | **Xuất file định nghĩa `.json`** (playlist + đồ hoạ, không có video) | gửi giáo án cho analyst khác, vài KB | 2 |
| 43 | **Thuyết minh giọng nói trên clip** | analyst nói sẵn, cầu thủ xem sau | 3 |

**Trả lời trực tiếp phần "đầy đủ hơn" của câu hỏi:** ba ví dụ được nêu là #1/#7 (freeze +
darken), #8/#15 (spotlight + highlight), #21/#23 (việt vị + cự ly). Còn lại 33 mục nữa ở trên,
và cái được đánh giá cao nhất trong số chưa được nêu là **#31** — vì hệ thống này đã có 1 300
event được tag kèm mốc thời gian cho mỗi trận, nên "cắt clip" phần lớn **không phải là cắt**:
nó là *lọc* cái đã có, bằng ba slicer đang chạy. Một analyst gõ "tất cả pha mất bóng của #6 ở
1/3 sân nhà" và nhận về một playlist — nhanh hơn mọi thao tác kéo thả timeline.

---

## 5. Menu chuột phải

### 5.1 Bố cục

```
        ┌──────────────────────────────────────────┐
        │  23:14.28 · Hiệp 1 · frame 34 857        │  ← khoảnh khắc được hỏi, tới frame
        ├──────────────────────────────────────────┤
        │  ⏸  Đứng hình tại đây               K    │
        │  ◀▶ Bước từng frame                , .   │
        │  ⏱  Tốc độ                          ▸    │  0.25× 0.5× 1× 1.5× 2×
        │  🔁 Lặp A–B từ đây                   L    │
        ├──────────────────────────────────────────┤
        │  🔦 Rọi đèn vào đây                  S    │  ← dùng ngay toạ độ vừa bấm
        │  🌓 Làm tối phần còn lại             D    │
        │  🔍 Phóng to vùng này                Z    │
        │  ✏️  Vẽ                              ▸    │  mũi tên · cong · nét đứt · bút · vùng · chữ · marker
        ├──────────────────────────────────────────┤
        │  📐 Đo                               ▸    │  khoảng cách · việt vị · cự ly dọc · khối · bán kính
        │  🎯 Căn sân…                    ✓ đã căn  │  ← trạng thái hiện ngay trên dòng
        ├──────────────────────────────────────────┤
        │  [  Đánh dấu đầu clip                    │
        │  ]  Đánh dấu cuối clip                   │
        │  ➕ Clip quanh event này (±6s)            │
        │  📋 Thêm vào playlist                ▸    │
        ├──────────────────────────────────────────┤
        │  📸 Lưu frame thành PNG                  │
        │  💾 Tải clip này về máy (.mp4)…          │  ← render tại chỗ, không upload
        │  💾 Tải cả playlist thành 1 file…        │
        │  🔗 Chép link tới khoảnh khắc này        │
        ├──────────────────────────────────────────┤
        │  ⤢  Thoát toàn màn hình            Esc   │
        └──────────────────────────────────────────┘
```

Nhóm 1 là thời gian, nhóm 2 là sự chú ý, nhóm 3 là đo, nhóm 4 là cắt, nhóm 5 là mang đi. Thứ tự
đó là thứ tự một analyst thực sự làm việc: *dừng → chỉ → đo → cắt → gửi*.

### 5.2 Mở menu là một hành động ĐỨNG HÌNH

Bấm chuột phải **tự động pause**. Không có ngoại lệ, và không có tuỳ chọn.

Mọi thứ trong menu đều nói về *khoảnh khắc này*; để video chạy tiếp trong lúc menu mở là để cái
khoảnh khắc ấy trôi mất trước khi người dùng chọn xong. Vị trí lúc bấm được ghi lại
(`t`, `x`, `y` trên hình) và **mọi mục trong menu dùng bộ ba đó**, không dùng vị trí con trỏ lúc
chọn — nên chuột có đi ngang qua ba mục khác trên đường tới "Rọi đèn" thì đèn vẫn rọi đúng chỗ
đã bấm.

### 5.3 Ba ràng buộc kỹ thuật đã biết trước

**(a) Menu phải là con của `#statsHolder`.** Phần tử toàn màn hình được vẽ ở *top layer*; bất cứ
node nào nằm ngoài nó đơn giản là **không hiện**, dù `z-index` bao nhiêu. Đây là hệ quả trực
tiếp của [thiết kế toàn màn hình](film-fullscreen-design.md) §4.4 — và cũng là lý do menu này
chỉ tồn tại trong chế độ toàn màn hình: ngoài đó nó là một bài toán khác.

**(b) `preventDefault()` trên `contextmenu`**, nếu không menu gốc của trình duyệt cho `<video>`
("Lưu video", "Sao chép địa chỉ video", "Picture in picture") sẽ đè lên. Hệ quả phụ có ích:
menu "Lưu video" của trình duyệt biến mất khỏi video của CLB.

**(c) `filmDocClick` sẵn có đóng slicer khi click ra ngoài.** Menu mới phải sống chung: nó nằm
**ngoài** `.fm-slicer`, nên một cú click mở menu cũng đóng slicer đang mở — đúng ý, vì hai thứ
không dùng cùng lúc. Chiều ngược lại phải viết thêm: click ra ngoài menu thì đóng menu.

### 5.4 Bàn phím: một ngăn xếp Escape

`filmKeys` hiện có ba tầng (slicer → input → phím phát). Thêm công cụ vẽ là thêm tầng, và
`Escape` phải đi từ trong ra ngoài, **mỗi lần một tầng**:

```
Escape #1 → đóng menu ngữ cảnh
Escape #2 → huỷ nét đang vẽ dở
Escape #3 → thoát chế độ vẽ, về chế độ xem
Escape #4 → bỏ chọn hình đang chọn
Escape #5 → thoát toàn màn hình   ← hành vi hôm nay
```

Nhảy cóc là cách chắc chắn nhất để một analyst mất 20 phút dựng đồ hoạ chỉ vì gõ nhầm một phím.
Tầng 5 hiện là *"native thì của trình duyệt, fallback thì của ta"* — luật đó giữ nguyên, nhưng
với native fullscreen thì tầng 1–4 phải xử lý được **trước khi** trình duyệt kịp thoát; vì
`Escape` ở native không huỷ được, cách duy nhất là: khi có bất kỳ tầng nào đang mở, **giữ
fullscreen bằng cách vào lại ngay** là sai và giật. Câu trả lời trung thực hơn: ở native
fullscreen, `Escape` luôn là "ra", và các tầng trong dùng **`Backspace`/nút X trên menu** để
đóng. Đây là một câu hỏi cần chốt (Q3, §16).

---

## 6. Lớp vẽ — mô hình dữ liệu

Một bản telestration là **một danh sách hình, mỗi hình có một khoảng thời gian sống**:

```jsonc
{
  "v": 1,
  "clipId": "…",
  "calib": {                      // §3.2, chỉ có khi analyst đã căn sân
    "H": [h11,h12,h13,h21,h22,h23,h31,h32,1],
    "at": 1234.56,                // frame nó được đo, để biết còn tin được không
    "rms": 0.28,                  // sai số reprojection, tính bằng MÉT
    "points": [[x,y,X,Y], …]      // giữ lại để sửa chứ không phải đo lại từ đầu
  },
  "shapes": [
    { "id":"s1", "kind":"spotlight", "space":"S",
      "in":1230.0, "out":1236.0,           // sống từ giây nào tới giây nào
      "at":{"x":412,"y":588}, "r":46,
      "style":{"color":"#E0122B","pulse":true,"width":3} },

    { "id":"s2", "kind":"arrow", "space":"S", "in":1231.5, "out":1236.0,
      "from":{"x":412,"y":588}, "to":{"x":690,"y":430},
      "curve":{"x":540,"y":470}, "dash":true },

    { "id":"s3", "kind":"offside", "space":"P", "in":1233.0, "out":1236.0,
      "X":742,                              // toạ độ sân, KHÔNG phải toạ độ hình
      "side":"home" },

    { "id":"s4", "kind":"compact", "space":"P", "in":1233.0, "out":1236.0,
      "unitA":[[210,180],[215,300],[212,420],[208,540]],   // 4 hậu vệ, toạ độ sân
      "unitB":[[420,240],[430,400],[425,510]],
      "metric":"vertical" },                // → 21.3m → tô xanh

    { "id":"s5", "kind":"track", "space":"T", "in":1230.0, "out":1238.0,
      "keys":[[1230.0,412,588],[1233.0,505,540],[1238.0,610,505]],
      "shape":"chevron" }                   // nội suy tuyến tính giữa các key
  ]
}
```

Bốn quyết định trong cấu trúc này:

1. **`space` nằm trên từng hình, không nằm trên bản vẽ.** Một bản vẽ thật sự trộn cả ba: mũi tên
   thì neo vào hình, vạch việt vị neo vào sân, vòng tròn bám người neo vào keyframe. Ép cả bản
   vẽ vào một hệ là hoặc mất mũi tên khi chưa căn sân, hoặc mất vạch việt vị khi đã căn.
2. **`in`/`out` là thời gian của FILE, không phải thời gian trận.** Cùng đơn vị với `r.t` của
   mọi event và với `filmCues`, nên không có phép đổi nào ở giữa để sai.
3. **Hình hệ P lưu toạ độ SÂN.** Nghĩa là nếu analyst căn lại sân chính xác hơn, **vạch việt vị
   tự nằm đúng lại**. Lưu toạ độ hình thì phải vẽ lại từ đầu.
4. **`space:"T"` là nội suy giữa các keyframe do người đặt**, không phải bám tự động. Ba key cho
   một pha 8 giây là đủ mượt, và analyst kiểm soát hoàn toàn.

Vẽ ra màn hình: một `<svg>` phủ đúng `pictureRect` (§3.1), cập nhật trong chính `filmFrame()` —
vòng lặp `requestAnimationFrame` **đã có sẵn** và đã làm đúng việc này cho các chấm trên sân
nhỏ. Không thêm vòng lặp thứ hai.

---

## 7. Clip & Playlist

### 7.1 Clip ảo là cái Film đã biết làm

```js
// filmWindows() hôm nay
{half:1, label:'1st Half', start:s1, end:e1}
// một clip
{clipId:'…', label:'Phản công 23:14', start:1230.0, end:1242.0}
```

Cùng một hình dạng. `filmFrame()` đã kẹp `currentTime` vào `[start, end]`, `filmBar()` đã vẽ
thanh tua theo cửa sổ đó, `filmCues()` đã lọc event theo hiệp. Cho nó một cửa sổ hẹp hơn là
**dùng lại toàn bộ máy móc đã chạy và đã có test**, không phải viết một trình phát thứ hai.

Đó là lý do "cắt ghép" ở đây rẻ tới mức đáng ngạc nhiên: hệ thống đã sống trong thế giới
"một file, nhiều cửa sổ" từ ngày Film ra đời.

### 7.2 Playlist = một danh sách cửa sổ, cộng thứ tự

```jsonc
{
  "title": "Họp đội thứ Ba — chuyển trạng thái phòng ngự",
  "clips": [
    {"kind":"title", "text":"MẤT BÓNG Ở 1/3 GIỮA SÂN", "seconds":4},
    {"kind":"clip", "matchId":"…", "in":1230.0, "out":1242.0,
     "note":"số 6 bước lên, không ai lấp",
     "drawings":"…", "speed":0.5, "pauseAt":[1233.2]},
    {"kind":"clip", "…":"…"}
  ]
}
```

`pauseAt` đáng chú ý: **clip tự đứng hình ở đúng cái frame "Aha!"**, chờ analyst gõ phím cách
để đi tiếp. Đó là toàn bộ nghi thức mà mục 1 của câu hỏi mô tả, được lưu lại thay vì phải diễn
lại bằng tay trong mỗi buổi họp.

Một playlist **trỏ tới nhiều trận cùng lúc** — vì mỗi clip mang `matchId` riêng. "Sáu lần đối
thủ ăn bàn từ phạt góc, trong bốn trận" là một playlist hợp lệ; nó chỉ cần đổi `videoSrc` giữa
các clip, và `filmStop()`/`filmStart()` đã làm đúng việc đổi nguồn.

### 7.3 Ghép nhiều đoạn — hai nghĩa, và cả hai đều được làm

- **Ghép để XEM trong app**: chính là playlist ở trên. Không encode gì, sửa được sau, đồ hoạ
  vẫn động. Đây là thứ dùng hàng ngày.
- **Ghép thành MỘT FILE `.mp4`**: §10. Cùng một playlist, một nút khác — và vì cái bơm frame
  là của ta (§10.2), ghép **không phải là nối hai file lại**, mà chỉ là *vẽ tiếp*: hết đoạn 1
  thì tua nguồn sang đoạn 2 và bơm tiếp vào cùng một bản ghi. Không có mối nối nào để hỏng, và
  thẻ tiêu đề giữa các đoạn chỉ là mấy frame được vẽ ra chứ không phải một đoạn video phải chèn.

---

## 8. Xuất ảnh — dễ, và đã chắc chắn chạy được

```js
const c=document.createElement('canvas');
c.width=v.videoWidth; c.height=v.videoHeight;
c.getContext('2d').drawImage(v,0,0);          // ← chỉ chạy khi canvas KHÔNG bị taint
// rồi vẽ lớp SVG lên trên qua một Image mang data: URL của chính SVG đó
c.toBlob(b=>{ /* tải về */ },'image/png');
```

Chỗ duy nhất có thể gãy là dòng có comment, và §11 đã đo được rằng nó **không gãy** trên site
thật. Xuất PNG vì thế là tier 1: một frame, đúng độ phân giải gốc của video (không phải độ phân
giải màn hình), có đồ hoạ, sẵn sàng dán vào slide.

---

## 9. Căn sân — luồng thao tác

```
Analyst đứng hình  →  menu → "Căn sân…"
   │
   ├─ Hình mờ đi 40%, hiện một sân 2D thu nhỏ ở góc
   ├─ Sân 2D sáng lên MỘT mốc mỗi lần ("góc vòng cấm trái-trên")
   ├─ Analyst bấm đúng mốc đó trên khung hình  →  cặp điểm #1
   ├─ …lặp lại cho tối thiểu 4 mốc
   │
   ├─ ≥4 điểm → tính H, vẽ đè **lưới sân ảo** lên khung hình
   │     analyst nhìn lưới có trùng vạch vôi thật không — đây là phép kiểm
   │     tra bằng mắt, và nó trung thực hơn bất kỳ con số nào
   │
   └─ Hiện sai số:  "±0.28 m — tốt"  /  "±1.9 m — nên thêm một mốc"
```

**Lưới ảo đè lên cỏ thật là toàn bộ giao diện kiểm tra.** Nếu lưới trùng vạch, mọi phép đo sau
đó đúng; nếu lệch, mắt thấy ngay lập tức. Không cần dạy ai về homography.

Điểm thứ 5 trở đi chuyển sang least-squares và thường kéo sai số xuống dưới 30cm — thừa chính
xác cho việt vị, vốn được tranh cãi ở mức nửa mét.

---

## 10. Xuất clip thật — render trong máy, xuống ổ đĩa, không qua cloud

### 10.1 Cách nào

| Cách | Tốc độ | Định dạng | Đánh giá |
|---|---|---|---|
| **`canvas.captureStream(0)` + `MediaRecorder`** | ~realtime | **MP4/H.264 đã đo được** (§18) | **ĐƯỢC CHỌN.** ~80 dòng, không thư viện, không build step |
| WebCodecs + muxer MP4 | nhanh hơn nếu nguồn cấp frame kịp | MP4 ở mọi nơi | nâng cấp về sau nếu Firefox thành vấn đề; cần một muxer từ CDN |
| ffmpeg.wasm | **chậm hơn realtime** | mọi thứ | **không.** ~30MB tải về cho một site tĩnh vốn tự hào không có external JS |
| Máy chủ ffmpeg | nhanh | mọi thứ | **không.** Worker không chạy được binary; phải dựng hạ tầng có trạng thái, tốn tiền |
| Cloudflare Stream | nhanh | HLS/MP4 | **không** — trái thẳng với yêu cầu: nó *là* lưu trữ video trên Cloudflare, tính phí theo phút |

Đã đo trên Chrome 148 (§18): `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028')`
là `true`, và file sinh ra có header `ftyp isom … avc1` thật. `isom`/`avc1` là hồ sơ MP4 mà
**QuickTime, PowerPoint, WhatsApp, iOS và Windows đều mở được** — đúng thứ cần khi đưa clip cho
một HLV cầm iPad. Firefox hiện chỉ ghi được WebM; ở đó UI phải nói thật và đề nghị WebM, chứ
không im lặng đưa ra một file HLV không mở nổi.

### 10.2 Cái bơm frame là của ta — và đó là quyết định quan trọng nhất của phần này

Không dùng `captureStream(30)` (để trình duyệt tự lấy frame theo nhịp compositor). Dùng
**`captureStream(0)` + `track.requestFrame()`**: mỗi frame ra là **một lời gọi của ta**.

```js
const stream = canvas.captureStream(0);
const track  = stream.getVideoTracks()[0];
// … mỗi lần vẽ xong một frame:
track.requestFrame();
```

Bốn thứ có được từ đúng dòng đó:

1. **Số frame chính xác.** 12 giây × 30fps = đúng 360 frame, dù máy đang tải nặng. Nhịp
   compositor thì không hứa gì cả — máy giật là clip mất frame.
2. **Đồ hoạ rơi đúng frame.** Một spotlight đặt ở `t=1233.0` xuất hiện ở đúng frame ấy, không
   phải "khoảng đó".
3. **Ghép đoạn không có mối nối.** Hết đoạn 1, tua nguồn sang đoạn 2, trong lúc chờ `seeked`
   thì vẫn bơm ra thẻ tiêu đề. Không khoảng trống, không phải nối file.
4. **Không phụ thuộc `requestAnimationFrame`.** Đo được ở §18.3: khi tab bị ẩn, rAF **dừng hẳn
   — 0 lần gọi trong 19.4 giây**. Một bộ render lấy nhịp từ rAF sẽ chết cứng khi analyst chuyển
   sang cửa sổ khác. Với bơm riêng, cùng điều kiện đó vẫn đạt **29.6 fps**.

Bộ đếm giờ của render là `t_out - t_in`, không phải đồng hồ treo tường — nên clip dài đúng bằng
cái được cắt, kể cả khi máy render chậm hơn hoặc nhanh hơn thời gian thực.

### 10.3 Và đây là chỗ nó KHÔNG đi qua Cloudflare

```
R2 (video gốc)  ──GET range──►  <video>  ──drawImage──►  <canvas>  ──requestFrame──►
                    chỉ đọc                                 │
                                          lớp đồ hoạ ───────┘
                                                            │
                                            MediaRecorder ──►  Blob (RAM)
                                                            │
                                     showSaveFilePicker() ──►  Ổ ĐĨA CỦA ANALYST
                                                            
                                    ✗ không R2 PUT   ✗ không Supabase Storage
                                    ✗ không upload   ✗ không link tạm
```

Mũi tên duy nhất chạm tới Cloudflare là **GET**, và nó là chính cái GET mà việc xem video vẫn
làm hằng ngày. Không thêm một request ghi nào.

**File đi thẳng ra ổ đĩa, không nằm trọn trong RAM.** `showSaveFilePicker()` (đã đo là có, §18.1)
cho một `FileSystemWritableFileStream`, và mỗi chunk `ondataavailable` được ghi ngay:

```js
const handle = await showSaveFilePicker({ suggestedName: 'phan-cong-2314.mp4',
  types:[{description:'MP4 video', accept:{'video/mp4':['.mp4']}}] });
const out = await handle.createWritable();
rec.ondataavailable = e => e.data.size && out.write(e.data);
rec.onstop = () => out.close();
```

Nghĩa là **không có trần bộ nhớ**: một file ghép 15 phút cho cả buổi họp cũng chỉ tốn vài MB RAM
tại một thời điểm. Analyst chọn thư mục, và file chỉ tồn tại ở đúng chỗ đó. Trình duyệt không
có API này (Firefox, Safari) rơi về `<a download>` với blob URL — vẫn tải được, nhưng file phải
nằm trọn trong RAM, nên UI cảnh báo khi bản ghép vượt ~10 phút.

### 10.4 Dung lượng và thời gian, nói thật

Đo được 2.4 MB/phút ở §18.2, **nhưng đó là nội dung tổng hợp phẳng lì nén cực tốt — đừng lấy
làm chuẩn.** Con số đáng tin là **bitrate đặt ra**: `videoBitsPerSecond: 6e6` ⇒ tối đa
**~45 MB/phút** cho cảnh quay bóng đá thật (cỏ, đám đông, camera pan — nén khó). Một clip 12
giây ≈ 9 MB; cả buổi họp 15 phút ≈ 675 MB nếu để 1080p/6Mbps, nên #41 (chọn bitrate) lên tier 2
chứ không phải trang trí: 720p/3Mbps đưa con số đó về ~340 MB.

Vì render chạy ~realtime, UI phải nói đúng: *"Đang kết xuất — 12s / 40s. Giữ tab này hiển thị."*
Ẩn tiến trình đi rồi giả vờ nó nhanh là cách chắc chắn nhất để người ta nghĩ nó hỏng.

### 10.5 Âm thanh

`AudioContext` → `createMediaElementSource(video)` → `MediaStreamAudioDestinationNode`, track
đó ghép vào stream đưa cho `MediaRecorder`. Sống qua các lần tua, nên ghép đoạn không mất tiếng.

Hai bẫy phải ghi lại: (a) khi đã route qua WebAudio thì phải nối thêm vào `ctx.destination`,
không thì analyst **không nghe thấy gì trong lúc render**; (b) media chéo origin đưa vào WebAudio
mà không có CORS thì ra **im lặng tuyệt đối, không báo lỗi** — §11 đã đo là có CORS, nhưng đây
là lý do thứ hai khiến §11.1 phải kiểm tra trước khi bật nút.

---

## 11. CORS và cái bẫy `crossorigin` — đã đo, không đoán

Mọi thứ ở §8 và §10 dựa vào **một** điều kiện: canvas không bị "taint". Một `<video>` chéo
origin làm canvas bẩn vĩnh viễn, và `toBlob` / `captureStream` sẽ ném lỗi bảo mật.

Video của hệ thống nằm ở `pub-9cdd291bf181425b9738328ada297691.r2.dev`, khác origin với site.
Đã đo bằng `curl`:

```
$ curl -I -H "Origin: https://hoangnam25012004.github.io"  …r2.dev/probe.mp4
Access-Control-Allow-Origin: https://hoangnam25012004.github.io
Vary: Origin

$ curl -I -H "Origin: https://evil.example.com"            …r2.dev/probe.mp4
(không có header CORS nào)
```

**Bucket đã có sẵn một CORS policy dạng allowlist, và origin của site nằm trong đó.** Nghĩa là
thêm `crossorigin="anonymous"` vào `<video>` sẽ cho canvas sạch, và cả hai tính năng xuất đều
chạy — **trên site đã deploy**.

### 11.1 Và đây là chỗ nó có thể phá video

`crossorigin="anonymous"` không phải một gợi ý. Nó **bắt buộc** phản hồi phải có ACAO khớp, nếu
không **video không load được gì cả**. Ba trường hợp sẽ mất trắng khả năng xem video nếu gắn
thuộc tính đó vô điều kiện:

1. mở site từ một origin chưa nằm trong allowlist (domain riêng trong tương lai, `localhost`,
   một bản preview)
2. một match có `video_url` **không phải R2** — bản báo cáo đóng băng ghi rõ `kind:'url'` cho
   trường hợp analyst dán một link bất kỳ, và CORS của bên thứ ba đó là không thể biết trước
3. bucket bị đổi policy sau này

Nên luật là: **không bao giờ gắn `crossorigin` vô điều kiện.**

```
nạp video KHÔNG có crossorigin           ← xem được, luôn luôn. Đây là mặc định.
   └─ song song: HEAD/GET một byte để dò ACAO
        ├─ có ACAO khớp → nạp lại VỚI crossorigin → mở khoá 📸 và 🎬
        └─ không       → giữ nguyên; hai mục đó xám đi kèm lời giải thích thật:
                          "Video này được phục vụ từ nơi không cho phép trang
                           đọc pixel của nó. Vẫn xem, vẫn vẽ, vẫn cắt clip ảo,
                           vẫn chia sẻ được — chỉ không xuất được ảnh/clip."
```

Xem là quyền cơ bản; xuất là quyền thêm. Không bao giờ đánh đổi ngược lại. Mọi thứ khác trong
tài liệu này — vẽ, đo, việt vị, clip ảo, playlist, chia sẻ — **không cần CORS gì cả**, vì chúng
không đọc pixel.

### 11.2 Video gốc không thể bị đụng tới — và đó là tính chất của code, không phải lời hứa

Yêu cầu "không ảnh hưởng video gốc trên Cloudflare" không được đáp ứng bằng cách *cẩn thận*.
Nó được đáp ứng vì **trong app channel không tồn tại đoạn code nào có thể ghi**:

```
client/app.html nạp:  supabase-js  ·  assets/supa.js  ·  assets/app.js
                      ✗ KHÔNG nạp cloud-sync.js
```

`uploadToR2()` và `setVideoUrl()` — hai hàm duy nhất trong cả repo có thể ghi lên R2 hoặc đổi
`matches.video_url` — **nằm trong `cloud-sync.js`**, tức là chúng không được định nghĩa trong
trang này. Đây không phải quy ước, mà là thứ `grep` trả lời được:

```
$ grep -rn "uploadToR2\|setVideoUrl\|workerUrl\|r2-presign" client/
client/index.html:780:  var CONTACT_ENDPOINT = '…/contact';   ← landing page, form liên hệ
```

Một tham chiếu duy nhất trong cả thư mục `client/`, và nó là endpoint `/contact` ở landing page
— không dính gì tới video. **App channel có 0 tham chiếu.**

Bốn tầng khoá, và tầng nào cũng đủ một mình:

| # | Tầng | Vì sao đủ |
|---|---|---|
| 1 | app channel không nạp `cloud-sync.js` | hàm ghi không tồn tại trong runtime đó |
| 2 | thiết kế này không gọi Worker presign | không có URL PUT nào được sinh ra |
| 3 | Worker chỉ ký PUT cho `matches/{matchId}/…` và đòi `matchId`+`filename` | dù có gọi cũng không ghi đè được object cũ — key luôn mang `Date.now()` |
| 4 | RLS: đổi `public.matches` là staff-only từ `0013` | một thành viên channel không update được `video_url` kể cả gọi thẳng Supabase |

Và một test sẽ khoá tầng 1 lại: *"không file nào trong `client/` nhắc tới `uploadToR2`,
`setVideoUrl` hay một PUT tới R2"* — cùng khuôn với test đã có cho `worker/r2-presign.js` ở
[contact-form-design.md](contact-form-design.md) §7.

### 11.3 Cầu thủ và HLV xem đúng như hôm nay

Yêu cầu thứ tư là thứ dễ vi phạm nhất, vì nó bị vi phạm **do vô ý**: thêm một lớp vẽ vào Film là
rất dễ khiến ai mở trận cũng thấy vòng tròn đỏ của analyst.

Luật: **lớp đồ hoạ là opt-in ở CẢ hai phía.**

| Ai | Mở trận trong channel thì thấy gì |
|---|---|
| Cầu thủ / HLV | **đúng Film của hôm nay.** Không nút chuột phải, không lớp SVG, không truy vấn nào thêm |
| Cầu thủ mở **link playlist được chia sẻ** | thấy clip + đồ hoạ — vì họ **chủ động bấm vào** nó |
| Analyst | y như trên, cộng menu chuột phải khi vào toàn màn hình |

Ba điều làm nó đúng:

1. **Node lớp vẽ không được tạo ra** khi không có bản vẽ nào đang mở. `filmHTML()` in thêm 0 ký
   tự trong trường hợp mặc định — đúng cách nút `#fmFull` đang làm với `filmFullOK()`.
2. **Không truy vấn nào thêm khi mở trận.** Bản vẽ chỉ được nạp khi mở một playlist.
3. **`video_url` không bao giờ bị viết lại**, nên nguồn phát của họ là cùng một object R2, cùng
   một byte, trước và sau khi analyst làm việc. Clip đã kết xuất **không tồn tại trong hệ thống**
   — nó nằm trên ổ đĩa của analyst.

Nói cách khác: nếu analyst dựng 40 clip và vẽ 200 hình, thứ mà một cầu thủ mở app lên nhìn thấy
**vẫn giống hệt hôm nay, tới từng pixel**, cho tới đúng lúc analyst gửi cho họ một link.

---

## 12. Lưu ở đâu — schema đề xuất

Theo đúng khuôn `0016_match_reports.sql`: additive, chạy lại được, RLS bật, tái dùng
`public.is_club_member()` / `is_club_admin()` / `is_staff()` chứ không phát minh lại.

```sql
-- 0020_film_clips.sql   (đề xuất — chưa viết)

create table if not exists public.film_playlists (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  note text,
  shared boolean not null default false,   -- cầu thủ trong channel xem được chưa
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.film_clips (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid references public.film_playlists(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,

  kind text not null default 'clip',        -- 'clip' | 'title'
  t_in double precision,                    -- đồng hồ CỦA FILE, như r.t
  t_out double precision,
  title text, note text, tags text[],

  drawings jsonb,                           -- §6
  calibration jsonb,                        -- §3.2, hoặc null
  speed real default 1, pause_at double precision[],

  order_index integer not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Ba điểm đáng nói:

- **`match_id` là `on delete set null`, không phải `cascade`.** Một clip mang trong nó công sức
  phân tích; xoá một trận không nên âm thầm xoá cả buổi họp đã dựng quanh nó.
- **`club_id` là cột quyết định quyền**, y như `match_reports` — nên RLS chỉ là một dòng
  `is_club_member(club_id)` cho đọc và `created_by = auth.uid() or is_club_admin(club_id)` cho
  ghi. Không có luật mới nào để hiểu sai.
- **Không có bảng nào cho `shapes` riêng.** Một bản vẽ là một tài liệu, luôn được đọc và ghi
  nguyên khối, và không bao giờ bị truy vấn theo từng hình — đúng lý do `match_reports.payload`
  là `jsonb`.

Kích thước: một bản vẽ dày là ~4KB JSON; một buổi họp 20 clip là ~80KB. Không đáng kể.

### 12.1 Cái KHÔNG được lưu, và đó mới là điểm chính

| Thứ | Lưu ở đâu | Bao nhiêu |
|---|---|---|
| Video gốc | R2, **y như hiện tại, không thêm không bớt** | không đổi |
| Định nghĩa clip (`t_in`/`t_out`/tiêu đề) | Postgres, `jsonb` + vài cột | vài trăm **byte** mỗi clip |
| Bản vẽ, ma trận căn sân | Postgres, `jsonb` | ~4 KB mỗi bản |
| **Clip đã kết xuất (.mp4)** | **KHÔNG LƯU Ở ĐÂU CẢ** — ổ đĩa của analyst | **0 byte** trên hạ tầng |
| Ảnh PNG đã xuất | như trên | **0 byte** |

Toàn bộ những gì hệ thống lưu thêm cho tính năng này là **văn bản đo bằng kilobyte, và nằm trên
Postgres chứ không phải Cloudflare.** Một CLB dùng cật lực cả mùa giải — 40 trận × 30 clip ×
4KB — cộng lại chưa tới **5 MB**. Không có bậc chi phí nào để chạm tới.

Và nếu muốn triệt để hơn nữa: #42 cho phép xuất chính những định nghĩa ấy ra một file `.json`
tải về, nên một analyst muốn **không lưu gì lên server cả** vẫn làm việc được trọn vẹn — giáo án
nằm trong một file vài KB cạnh mấy cái `.mp4` trên máy họ.

---

## 13. Không đụng gì của tính năng khác

Đây là ràng buộc lặp lại từ hai lần trước, và với tính năng này nó khó hơn, vì lần này có
những thứ **phải** chạm vào code dùng chung. Thiết kế đặt chúng ở chỗ ít rủi ro nhất:

| Cần | Cách làm không phá cái đang chạy |
|---|---|
| Lớp SVG vẽ trên khung hình | **thêm một node con** vào `#fmStage`, không sửa `<video>` và không sửa `#fmCap` |
| Cập nhật lớp vẽ mỗi frame | gọi từ **`filmFrame()` đã có** — một dòng, sau `filmBall()`; ngoài chế độ vẽ nó return ngay |
| Menu chuột phải | listener `contextmenu` trên `#fmStage`, add/remove **theo tên hàm** trong `filmStart`/`filmStop`, đúng khuôn bắt buộc của file |
| Cửa sổ clip | dùng lại `filmWindows()` — clip là một `{start,end}`, đúng hình dạng đã có |
| `crossorigin` | **không đụng lúc nạp lần đầu** (§11.1); chỉ nạp lại khi đã dò được ACAO |
| Bàn phím | thêm tầng vào `filmKeys`, **trên** ba nhánh phím phát hiện có, mỗi tầng có `return` riêng |
| CSS | khối mới ở cuối `stats-view.css`, mọi selector dưới `.film-full` hoặc `.fm-tel*` — cùng luật đã có test ở lần trước |

Bốn thứ **không được động tới trong bất kỳ trường hợp nào**: `filmCues()` (đã có test khoá thứ
tự và cách gom entry), `filmSlicerFit()` (§9 lần trước đã chứng minh nó tự đúng), `renderStats()`
ngoài một dòng dọn dẹp nếu cần, và `Stats/report.js`.

Ba tab Overall / Dashboard / Stats, trang Stats của app tagging, Player-Lists và app tagging
**không nhận một dòng nào** — như hai lần trước.

---

## 14. Lộ trình

Không làm một lần. Mỗi tier tự nó đã dùng được, và tier sau không sửa lại tier trước.

**Tier 1 — "đủ cho một buổi họp đội thật, và đã có file mang đi"**
Menu chuột phải · freeze tới frame · bước frame · tốc độ · A–B loop · dim · spotlight · zoom ·
mũi tên (thẳng/cong/nét đứt) · bút · vùng · chữ · marker · mark in/out · clip từ event ·
playlist · phát liên tục · chia sẻ · link tới khoảnh khắc · **xuất PNG** ·
**xuất MỘT clip .mp4 tải về máy** (#38).
*Không cần calibration, không cần bảng mới nếu playlist lưu tạm ở `localStorage` trước.*

> #38 lên tier 1 sau bản sửa 2, vì nó là ràng buộc chứ không phải phần thưởng — và vì §18 đã
> chứng minh cả chuỗi chạy được với ~80 dòng, không thư viện, không hạ tầng. Không có lý do kỹ
> thuật nào để hoãn nó.

**Tier 2 — "đo được, và ghép được"**
Căn sân + lưới kiểm tra · vạch việt vị · đo mét · cự ly dọc/ngang có ngưỡng màu · khối phòng
ngự · bán kính · hành lang · **chiếu event đã tag lên khung hình** · bám cầu thủ bằng keyframe ·
**ghép nhiều đoạn (và nhiều trận) thành một file** (#39, #40) · **chọn độ phân giải/bitrate**
(#41) · **xuất file định nghĩa `.json`** (#42) · hai bảng Supabase.

**Tier 3 — "làm cho nhanh và cho êm"**
Thuyết minh giọng nói (#43) · WebCodecs thay `MediaRecorder` nếu Firefox thành vấn đề thật ·
ghi thẳng ra đĩa cho trình duyệt không có File System Access.

---

## 15. Không làm

- **Tự động bám cầu thủ / tự dò vạch sân.** Cần thị giác máy tính và dữ liệu tracking. Đây là
  ranh giới thật giữa tài liệu này và Second Spectrum, và nói thẳng ra thì tốt hơn là hứa.
- **Máy chủ xử lý video.** §10.1.
- **ffmpeg.wasm.** §10.1.
- **Tải clip đã kết xuất lên R2 / Supabase Storage / Cloudflare Stream.** Bản sửa 2 loại bỏ
  hoàn toàn — không phải vì khó, mà vì được yêu cầu là không. Clip sống trên ổ đĩa của analyst;
  muốn chia sẻ trong app thì đã có clip ảo, vốn tốn 0 byte và sửa được sau (§0.1).
- **Ghi đè hay đụng tới object video gốc.** §11.2 — bốn tầng khoá.
- **Sửa video** (cắt màu, ổn định hình, ghép nhạc). Đây là công cụ phân tích, không phải NLE.
- **Vẽ đồng thời nhiều người theo thời gian thực.** Một bản vẽ có một chủ; chia sẻ là chia sẻ
  kết quả.
- **Menu chuột phải ngoài chế độ toàn màn hình.** §1.

---

## 16. Câu hỏi cần chốt trước khi viết code

**Q1 — Ai được vẽ và cắt clip trong channel?**
- (A) Chỉ admin của channel — an toàn nhất, và đúng với việc `match_reports` chỉ admin mới
  publish được.
- **(B) Mọi thành viên channel, nhưng mỗi người chỉ sửa được của mình; chỉ admin mới bấm
  "chia sẻ cho cả đội" — đề xuất.** Trợ lý HLV cũng dựng clip, và họ không phải admin.
- (C) Chỉ staff.

**Q2 — Playlist tier 1 lưu ở đâu?**
- **(A) `localStorage` trước, Supabase ở tier 2 — đề xuất.** Tier 1 chạy được ngay mà không cần
  migration nào, và cấu trúc JSON giữ nguyên khi lên cloud.
- (B) Supabase ngay từ tier 1: chia sẻ được luôn, nhưng phải chốt schema trước khi biết analyst
  thực sự cần lưu gì.

**Q3 — `Escape` trong native fullscreen (§5.4)?**
- **(A) `Escape` luôn là "thoát toàn màn hình"; các tầng trong dùng `Backspace` và nút X —
  đề xuất.** Trung thực với việc trình duyệt không cho ta huỷ phím đó.
- (B) Cố giữ ngăn xếp 5 tầng: sẽ chạy đúng ở chế độ dự phòng và sai ở native, tức là **hành vi
  khác nhau giữa hai chế độ** — thứ tệ hơn cả hai lựa chọn.

**Q4 — ~~Xuất clip thật có nằm trong kế hoạch không~~ → ĐÃ CHỐT ở bản sửa 2: có, tier 1.**
Câu hỏi còn lại hẹp hơn: **Firefox thì sao?** Nó chỉ ghi được WebM, mà WebM thì iPhone và
PowerPoint không mở.
- **(A) Xuất WebM và nói thẳng: "Trình duyệt này chỉ tạo được .webm. Dùng Chrome hoặc Edge để
  có .mp4." — đề xuất.** Trung thực, 0 dòng thêm.
- (B) Kéo WebCodecs + muxer từ CDN vào ngay tier 1 để Firefox cũng ra MP4: thêm một dependency
  ngoài cho một trình duyệt mà chưa ai nói là đang dùng.

**Q5 — Bao nhiêu phút là "quá dài" cho một lần ghép?**
Ở 1080p/6Mbps thì 15 phút ≈ 675 MB và mất 15 phút render (§10.4).
- **(A) Không chặn, nhưng cảnh báo từ 5 phút và hiện luôn dung lượng ước tính — đề xuất.**
- (B) Chặn cứng ở 10 phút.

---

## 17. Tóm tắt một câu

Telestration và cắt ghép **làm được trên chính hạ tầng đang có, và bản sửa 2 khiến nó rẻ hơn
nữa**: clip xuất ra là MP4/H.264 thật, kết xuất ngay trong máy analyst và đi thẳng xuống ổ đĩa
của họ, nên hệ thống lưu thêm **0 byte video** và quan hệ với Cloudflare vẫn là **chỉ đọc** —
video gốc không thể bị đụng tới vì app channel thậm chí không nạp đoạn code có thể ghi, và một
cầu thủ mở app lên vẫn thấy đúng những gì họ thấy hôm nay, tới từng pixel.

---

## 18. Đã đo, không đoán

Chạy thật trong trình duyệt (Chrome 148). Đây là những dữ kiện mà cả §10 dựa vào.

### 18.1 Trình duyệt có đủ đồ nghề

```
MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')  → true
MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028')  → true
MediaRecorder.isTypeSupported('video/webm;codecs=vp9')         → true
canvas.captureStream · video.captureStream                     → có
VideoEncoder · VideoFrame (WebCodecs)                          → có
requestVideoFrameCallback                                      → có
window.showSaveFilePicker  (ghi thẳng ra ổ đĩa)                → có
AudioContext                                                   → có
```

### 18.2 Đường ống kết xuất chạy, và ra file thật

Vẽ 60 frame tổng hợp 1280×720 (nền sân + lớp làm tối + một spotlight di chuyển — tức đúng hình
dạng của một clip có telestration), bơm qua `captureStream(0)` + `requestFrame()`, ghi bằng
`MediaRecorder` ở `video/mp4;codecs=avc1.640028`:

```
framesPumped   60          wallSeconds  2.02        effectiveFps  29.6
bytes          85 219      chunks       2
```

Và kiểm tra container của chính cái blob đó:

```
header   "...$ftypisom....isomiso6iso2avc1"
ftyp tại offset 4   → true          brand → isom
video.canPlayType('video/mp4; codecs="avc1.640028"') → "probably"
```

`isom` + `avc1` là hồ sơ MP4 phổ thông nhất — mở được ở QuickTime, PowerPoint, WhatsApp, iOS,
Windows. **Đây là bằng chứng cho yêu cầu "video thật, tải xuống được".**

Về dung lượng: 85 KB cho 2 giây ⇒ 2.4 MB/phút, **nhưng nội dung tổng hợp phẳng nén quá tốt nên
con số đó vô nghĩa với bóng đá thật.** Chuẩn đáng tin là bitrate đặt ra: 6 Mbps ⇒ ~45 MB/phút.

### 18.3 Và một cái bẫy chỉ lộ ra khi đo

```
document.visibilityState = 'hidden'
requestAnimationFrame  →  0 lần gọi trong 19 399 ms      ← DỪNG HẲN, không phải chậm lại
setTimeout + track.requestFrame()  →  29.6 fps            ← cùng điều kiện đó
```

Một bộ kết xuất lấy nhịp từ `requestAnimationFrame` sẽ **treo cứng** ngay khi analyst chuyển
sang cửa sổ khác — và tệ hơn treo: `MediaRecorder` vẫn chạy, nên đồng hồ vẫn trôi trong khi
không có frame nào tới. Đây là lý do §10.2 chọn `captureStream(0)` với bơm riêng, thay vì
`captureStream(30)` phó mặc cho compositor.

### 18.4 CORS (đo ở §11, nhắc lại vì §10 phụ thuộc vào nó)

```
Origin: https://hoangnam25012004.github.io  →  Access-Control-Allow-Origin: <chính nó>
Origin: https://evil.example.com            →  (không có header CORS nào)
```

Allowlist thật, và origin của site nằm trong đó ⇒ canvas không bị taint ⇒ §10 chạy được.

### 18.5 Cái CHƯA đo được

- **Kết xuất từ một `<video>` R2 thật.** Chuỗi canvas→MP4 đã chứng minh; mắt xích còn lại
  (`drawImage(video)` trên một video có `crossorigin` và ACAO khớp) là hành vi theo spec, nhưng
  chưa chạy trên một object thật vì chưa có key nào trong tay. **Đây là việc đầu tiên phải làm
  khi bắt đầu code**, và là chỗ duy nhất có thể phát sinh bất ngờ.
- **Firefox và Safari.** Mọi số ở trên là của một trình duyệt. Firefox gần như chắc chắn ra
  WebM — xem Q4.
- **`showSaveFilePicker`** cần user gesture nên không chạy được trong môi trường kiểm tra này;
  chỉ xác nhận được là API có mặt.

---

## 19. Tier 1 — đã chạy thật trong trình duyệt

Harness cục bộ **tự sinh ra một video MP4 thật** (canvas → MediaRecorder → blob URL) rồi mount
`PTStats` đúng như `client/assets/app.js` mount nó. Blob URL là same-origin, nên canvas không
bị taint — tức là tái tạo đúng điều kiện mà §11 đã đo được là đang đúng với bucket R2, mà không
cần một key nào của bucket. Video: **960×540**, 10.9 giây, 40 event đã tag.

### 19.1 Khung, menu và lớp vẽ

| Kiểm tra | Kết quả |
|---|---|
| Chưa mở gì: `.fmt-layer` có trong DOM không | **không** — cam kết "cầu thủ thấy Film của hôm nay" |
| Stage 912×634 ôm hình 910×512 → **122px dải đen** | đúng cái bẫy §3.1 |
| Chuột phải khi video **đang chạy** | **tự pause** (§5.2) |
| Menu là con của phần tử nào | `#statsHolder` — phần tử toàn màn hình (§5.3a) |
| Header menu | `00:04 · 1st Half` — đồng hồ trận của cú bấm |
| Số mục | 31, nằm trọn trong màn hình |
| Bấm "Rọi đèn vào đây" | lớp vẽ được tạo, `viewBox="0 0 960 540"` = **pixel của video** |
| Lớp vẽ nằm đúng trên hình | lệch `dx=1, dy=1` (làm tròn nửa pixel), `dw=dh=0` |
| Spotlight rơi ở đâu | **cx=480, cy=270** — đúng tâm của video 960×540, đúng chỗ đã bấm |
| `pointer-events` của lớp khi chưa cầm công cụ | `none` — mặt video vẫn không nhận click |
| Phím `d` → làm tối | lớp tối + **lỗ khoét đúng tại spotlight** (cx=480) |

### 19.2 Hai đường xuất — giải mã ngược để kiểm

**PNG** — `Saint_Lucia_vs_Barbados_00m04s.png`, 40 650 byte, magic `89 50 4E 47`,
**960×540 (độ phân giải gốc của video, không phải của màn hình)**. Đọc lại từng pixel:

```
trong vòng sáng   (480,270) → 216,229,218     ← video thật, không bị làm tối
dưới lớp tối       (20, 20) →  95, 97, 95     ← lớp tối nằm TRONG pixel
trên viền spotlight(480,229) → 224, 18, 43    ← #E0122B, đồ hoạ đã burn vào
```

**MP4** — `Saint_Lucia_vs_Barbados_Clip_00_03.mp4`, 55 128 byte, header
`ftyp isom … avc1`, giải mã ra **960×540, dài 2.02 giây** cho đoạn được cắt 3.00→5.00.

Spotlight được đặt ở giây 4.2 của nguồn, tức 1.2 giây sau khi clip bắt đầu. Đọc lại pixel ở
hai thời điểm **bên trong chính file đã xuất**:

```
tại 0.4s  (nguồn 3.4s, trước khi có spotlight)   tâm →  81, 88, 81   tối
tại 1.6s  (nguồn 4.6s, sau khi có)               tâm → 212,231,215   sáng
                                                 góc →  53, 58, 52   vẫn tối
                                                 viền → 189, 30, 45   đỏ
```

Đây là bằng chứng mạnh nhất có thể có: **đồ hoạ nằm trong pixel của file xuất ra, và xuất hiện
đúng frame nó được đặt** — tức cái bơm frame ở §10.2 đang lấy nhịp từ `currentTime` của nguồn
chứ không phải từ đồng hồ treo tường.

Thời gian: **5.9 giây cho một clip 2 giây** (gồm cả dựng, tua và phát realtime).

### 19.3 Không phá gì — và hai chỗ chưa đủ

| Kiểm tra | Kết quả |
|---|---|
| `←`/`→` vẫn tua, `Space` vẫn play/pause | ✔ — toolkit trả lại mọi phím không phải của nó |
| Rời Film: lớp vẽ, menu, drawer, toast, class `.film-full` | **biến mất hết**, Overall vẽ bình thường |
| Dashboard / Stats / Overall | ✔ |
| Vào lại Film | 3 slicer, 40 dòng, nút toàn màn hình, và bản vẽ được khôi phục |
| Console error | **không có** |
| `node tests/run.js` | **1074/1074**, 1046 test cũ nguyên vẹn |

**Chưa đủ so với danh sách Tier 1, và không nên giả vờ là đủ:**

1. **Playlist mới có một nửa.** Thêm, liệt kê, phát, phát liên tục, xoá, tải từng clip — có.
   Đổi thứ tự, đổi tên, ghi chú, tag — **chưa**. Thẻ tiêu đề giữa các clip (#34) cũng chưa,
   vì nó chỉ có ý nghĩa khi ghép thành một file, mà ghép là #39/Tier 2.
2. **"Chia sẻ cho cầu thủ" không làm được ở Tier 1, và đó là hệ quả của Q2.** `localStorage`
   là của riêng một trình duyệt trên một máy: một giáo án dựng ở đây không có đường nào tới
   điện thoại của cầu thủ. Muốn chia sẻ thì phải có hai bảng ở §12 — tức Tier 2. Danh sách
   Tier 1 ở §14 liệt kê "chia sẻ" là **sai từ lúc viết thiết kế**, vì nó mâu thuẫn với Q2=A;
   ghi lại ở đây thay vì lặng lẽ bỏ qua.

### 19.4 Vẫn chưa đo được

- **Kết xuất từ một `<video>` R2 THẬT.** Harness dùng blob URL same-origin. Mắt xích
  `crossorigin` + ACAO thật vẫn chưa chạy trên một object thật — §18.5 nói rồi, và nó vẫn
  đúng. Code đã chuẩn bị sẵn: `exportClip()` đọc một pixel bằng `getImageData` **trước khi**
  khởi động recorder, nên trường hợp taint kết thúc bằng một câu tiếng Việt chứ không phải bốn
  mươi giây im lặng rồi hỏng.
- **Firefox và Safari.** Mọi số ở trên là của Chrome 148.
- **`showSaveFilePicker`.** Bản Tier 1 dùng `<a download>`; đường ghi thẳng ra đĩa (§10.3) là
  việc của Tier 3, và cần user gesture nên không kiểm được ở đây.
