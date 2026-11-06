# Portal: Hướng dẫn dùng Film (guide)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/guide.html` |
| File nguồn | [`apps/portal/guide.html`](../../apps/portal/guide.html) (nội dung) · [`assets/guide.js`](../../apps/portal/assets/guide.js) (~200 dòng) |
| CSS | `site.css`, `app.css`, `guide.css` |
| Người dùng | HLV và analyst của CLB khi xem Film |
| Đăng nhập | Không cần, và **cố ý** không cần: trang phải mở được cả khi phiên đã hết hạn, khi chưa đăng nhập hay khi DB đang lỗi |
| Vào từ đâu | Link **Guidelines** dưới thanh điều khiển của Film ([portal-app.md](portal-app.md), mục 3), do `mount(..., {guide:'guide.html'})` truyền vào |
| Design doc | [`film-guidelines-design.md`](../design/film-guidelines-design.md) |

Đây là trang tài liệu tĩnh, mô tả màn hình Film và bộ công cụ analyst. `guide.js` làm đúng 2
việc và không đụng tới bất cứ thứ gì ngoài trang này: nó **không** nạp Supabase, `app.js` hay
bất kỳ script nào của channel.

## 1. Nội dung (19 mục)

| # | Mục | Nội dung |
| --- | --- | --- |
| 01 | In one minute | Tóm tắt trong một phút |
| 02 | What is on the screen | 6 vùng: nút chọn hiệp, khung hình, dải chú thích, thanh điều khiển, bản đồ sân, bộ lọc và danh sách event |
| 03 | Playing the match | Phát, tua, tốc độ |
| 04 | The two halves | Chuyển hiệp 1/2 |
| 05 | Showing only what you want | Bộ lọc đội, cầu thủ, event |
| 06 | The event list | Danh sách event, dòng đang phát được tô sáng |
| 07 | The pitch map | Bản đồ sân chạy theo video |
| 08 | Full screen | Hai thứ chỉ có trong full screen |
| 09 | The analyst tools | Menu chuột phải, từng mục |
| 10 | Drawing on the frame | Vẽ, spotlight, sửa hình đã vẽ |
| 11 | How long a drawing stays | Làn timeline, cửa sổ thời gian, ghim, dừng hình khi export |
| 12 | Following players | Spotlight bám theo keyframe, Link players, Defensive line |
| 13 | Measuring on the pitch | Căn sân 4 điểm, đo Distance / Width / Depth / Area, số đo là xấp xỉ |
| 14 | Clips and the clip editor | Tạo clip, clip list, timeline: Split, Speed, Freeze, Text, Transition, Preview |
| 15 | Tags and playlists | Code, nhãn, ghi chú, playlist, Private / Whole channel |
| 16 | Taking work out of the app | PNG, MP4, link |
| 17 | Every keyboard shortcut | Toàn bộ phím, cả trong clip editor và panel Tag |
| 18 | If something does not work | Bảng triệu chứng, nguyên nhân, cách xử lý |
| 19 | What Film does not do | Những gì Film không làm |

> Nội dung trang phải khớp với `film-tools.js` và phần Film của `stats-view.js`. Thêm hay đổi
> mục menu hoặc phím tắt trong Film thì phải cập nhật mục 09 và 17 của trang này.

## 2. Chức năng (guide.js)

### 2.1 Ảnh hướng dẫn

Mỗi `<figure class="g-shot">` là một ảnh chụp thật từ trận Haiti – Saint Lucia (channel công khai),
nằm ở `apps/portal/assets/guide/`. Thêm ảnh thì phải thêm dòng `cp` trong `deploy.yml`; test chặn
nếu thiếu file, thiếu dòng `cp` hoặc số trên ảnh không khớp chú giải.

- Số đỏ là `<span class="g-pin">` đặt theo % trên ảnh, không vẽ vào ảnh. Nhờ vậy số luôn nét và
  chụp lại ảnh không phải vẽ lại.
- `<ol class="g-key">` là chú giải, đánh số bằng CSS counter.
- Ảnh dùng `loading="lazy"`, bấm vào mở cỡ đầy đủ. `guide.js` không xử lý gì cho ảnh.
- Ảnh 18-tag và 19-tags có nội dung mẫu, vì channel công khai không có tag thật. Không có gì được ghi
  vào database khi chụp.
- **Đổi giao diện Film thì phải chụp lại ảnh liên quan.** Chụp ở khung 1440×900, tỉ lệ điểm ảnh 1.5.

### 2.2 Scrollspy: tô sáng mục đang đọc

[`spy`](../../apps/portal/assets/guide.js#L34), [`pick`](../../apps/portal/assets/guide.js#L45)
và [`onScroll`](../../apps/portal/assets/guide.js#L67) tô sáng mục tương ứng ở cột Contents bên
trái khi người đọc cuộn.

### 2.3 Mục lục trên điện thoại

[`mobileToc`](../../apps/portal/assets/guide.js#L84) **clone** danh sách Contents của bản
desktop vào một `<details>` cho màn hẹp. Nhờ vậy chỉ có một danh sách cần giữ đúng.

[`boot`](../../apps/portal/assets/guide.js#L98) gọi các phần trên khi trang tải.

## 3. Dữ liệu

Không đọc hay ghi localStorage, cũng không gọi Supabase. Ảnh là file tĩnh của chính site.

## 4. Liên kết ra

Logo (`index.html`) · `app.html` (quay về channel).

## 5. Lưu ý khi sửa

- Clip mới thì thêm vào manifest trong `guide.js` và đưa file lên bucket. Trang vẫn chạy khi file
  chưa có.
- `guide.css`/`guide.js` có `?v=`, và `app.css` cũng được nạp ở đây. Bump thì phải bump ở mọi
  trang đang nạp file đó.
- Test: `tests/film-guidelines.test.js`, `tests/mobile-ui.test.js`, `tests/favicon.test.js`.
