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

Đây là trang tài liệu tĩnh, mô tả màn hình Film và bộ công cụ analyst. `guide.js` làm đúng 3
việc và không đụng tới bất cứ thứ gì ngoài trang này: nó **không** nạp Supabase, `app.js` hay
bất kỳ script nào của channel.

## 1. Nội dung (16 mục)

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
| 11 | How long a drawing stays | Cửa sổ thời gian của hình vẽ |
| 12 | Clips and playlists | 3 cách tạo clip |
| 13 | Taking work out of the app | Export PNG, MP4, link khoảnh khắc |
| 14 | Every keyboard shortcut | Bảng phím tắt |
| 15 | If something does not work | Xử lý sự cố |
| 16 | What Film does not do | Giới hạn |

> Nội dung trang phải khớp với `film-tools.js` và phần Film của `stats-view.js`. Thêm hay đổi
> mục menu hoặc phím tắt trong Film thì phải cập nhật mục 09 và 14 của trang này.

## 2. Chức năng (guide.js)

### 2.1 Clip demo cho từng mục

Mỗi `<figure>` trong trang khai báo một clip demo. File clip nằm trên cùng bucket R2 với video
trận đấu.

- [`buildClips`](../../apps/portal/assets/guide.js#L86) hỏi **poster** trước. Có poster thì mới
  dựng `<video preload="none">`, vì 13 clip cùng tải metadata ngay khi mở trang sẽ quá tốn băng
  thông.
- [`poster`](../../apps/portal/assets/guide.js#L52) gắn ảnh poster.
- [`notice`](../../apps/portal/assets/guide.js#L59): file chưa có trên bucket thì thay bằng một
  câu thông báo, không coi là lỗi. Phần chữ hướng dẫn phía trên đã đủ để làm theo.
- [`missing`](../../apps/portal/assets/guide.js#L68) khôi phục nội dung gốc của figure khi clip
  hoá ra không phát được.

### 2.2 Scrollspy: tô sáng mục đang đọc

[`spy`](../../apps/portal/assets/guide.js#L126), [`pick`](../../apps/portal/assets/guide.js#L137)
và [`onScroll`](../../apps/portal/assets/guide.js#L159) tô sáng mục tương ứng ở cột Contents bên
trái khi người đọc cuộn.

### 2.3 Mục lục trên điện thoại

[`mobileToc`](../../apps/portal/assets/guide.js#L176) **clone** danh sách Contents của bản
desktop vào một `<details>` cho màn hẹp. Nhờ vậy chỉ có một danh sách cần giữ đúng.

[`boot`](../../apps/portal/assets/guide.js#L190) gọi các phần trên khi trang tải.

## 3. Dữ liệu

Không đọc hay ghi localStorage, cũng không gọi Supabase. Chỉ có các request `GET` tới bucket R2
để lấy poster và clip.

## 4. Liên kết ra

Logo (`index.html`) · `app.html` (quay về channel).

## 5. Lưu ý khi sửa

- Clip mới thì thêm vào manifest trong `guide.js` và đưa file lên bucket. Trang vẫn chạy khi file
  chưa có.
- `guide.css`/`guide.js` có `?v=`, và `app.css` cũng được nạp ở đây. Bump thì phải bump ở mọi
  trang đang nạp file đó.
- Test: `tests/film-guidelines.test.js`, `tests/mobile-ui.test.js`, `tests/favicon.test.js`.
