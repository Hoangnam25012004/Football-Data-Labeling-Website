# Film — Analyst Toolkit (thiết kế lại menu chuột phải)

Figma: `p2eyMKXOOX5OvvM2fUGyIF` — "HoangNam Film — Analyst Toolkit". Các frame 01–07.
Tài liệu nền: [film-telestration-design.md](film-telestration-design.md),
[film-telestration-time-design.md](film-telestration-time-design.md).

## 1. Phạm vi

Chỉ đổi lớp công cụ trong full screen của portal (`apps/portal/assets/film-tools.{js,css}`).
Video, tab hiệp, thanh transport, bảng sân và danh sách sự kiện giữ nguyên.
`Stats/stats-view.js` không bị sửa, nên trang Stats của tagger không đổi gì.

## 2. Bốn quyết định đã chốt với chủ dự án (2026-11-06)

| Câu hỏi | Quyết định |
|---|---|
| Bám cầu thủ | **Keyframe.** Analyst đặt vòng ở vài khung, phần mềm nội suy tuyến tính. Không có thị giác máy tính |
| Lưu tag | **Supabase**, migration 0027, RLS theo channel. Không đụng dữ liệu sự kiện gốc |
| Clip editor | Split, Speed theo đoạn, Freeze, Text, Transition (Cut/Fade). **Không** Voice-over, Flash, Zoom |
| Đo đạc | Căn sân theo khung hình, số đo có dấu `≈` |

## 3. Chỗ khác Figma, và lý do

Figma được vẽ trước khi đối chiếu với mã. Những điểm dưới đây đổi vì bản vẽ không làm được hoặc
sẽ phá một hành vi đang chạy.

| Figma | Bản thật | Lý do |
|---|---|---|
| `Near #6` | `Event: #6` | Không có dữ liệu vị trí cầu thủ. Chip đọc cầu thủ của sự kiện đang chạy |
| `F` = Freeze | `Q` | `F` đang là bật/tắt full screen, guide và CLB đã quen |
| `1–9` = Tag | `G`. Trong panel Tag, `1–9` mới chọn code | Hàng số đang đặt thời lượng hình vẽ, và test ghim rằng nó trả phím lại khi không có gì được chọn |
| `Ctrl Z` | `U` | `filmKeys` bỏ qua mọi phím có Ctrl trước khi tới công cụ |
| Phím tắt trong Draw ▸ (`A C R P Z G Y O`) | Bỏ | Trùng phím toàn cục. Không quảng cáo phím không chạy |
| Tile `In / Out` một ô | Hai ô `In`, `Out` | Hai thao tác khác nhau, cần hai đích bấm |
| Làn timeline dưới hình | Vẫn ở trên hình | Dải dưới hình là caption của Film. Xem film-telestration-time-design |
| Làn timeline ±15 s | Cả hiệp | Giữ hành vi và test hiện có; bản đồ cả hiệp giúp nhảy tới hình vẽ xa |
| Badge số áo trong Link players | Số thứ tự 1, 2, 3 | Không biết cầu thủ nào ở điểm vừa click |
| Share: `Tagged players` | `Private` / `Whole channel` | Thành viên channel không gắn với số áo |
| Measure: `Speed` | Bỏ | Camera lia nên hai khung khác nhau không dùng chung một căn sân |
| `Snap to feet` | Bỏ | Cần thị giác máy tính |
| Speed: `Ramp` | Bỏ | Giữ Speed theo đoạn: tách rồi đặt tốc độ từng đoạn |
| Window: `Possession` | Bỏ | Dữ liệu không có ranh giới pha kiểm soát bóng |
| `Save to collection` | `Save to playlist` | Một khái niệm, một tên |

## 4. Bố cục giao diện

- **Menu** (`menuModel` + `build`): header, hàng transport, ba nhóm, footer. Có `max-height` và
  cuộn nên màn hình thấp vẫn dùng được. Vì vậy submenu là `position:fixed`, đặt bằng JS, nếu
  không sẽ bị `overflow` của menu cắt.
- **Inspector** (`.fmt-insp`): con của `#fmStage`, nên không che cột phải. Đặt dưới làn timeline,
  chiều cao tự trừ phần editor.
- **Clip editor** (`.fmt-ed`): con của `#fmStage`, nằm đáy stage.
- Mọi panel chặn `pointerdown / contextmenu / wheel / click` ở chính nó. Nếu không, bấm vào panel
  sẽ tới `onDown` của stage và đặt spotlight xuống hình.

## 5. Mô hình dữ liệu (localStorage `hna.film.tools.v1`)

Bản ghi cũ vẫn đọc được: mọi trường mới đều là tuỳ chọn.

```text
spotlight  { at, r, look?: circle|ring|beam|both|head, label?, keys?: [{t,x,y}] }
link       { sub: chain|line|shape, pts: [{x,y,keys?}], track?, dist?, H?, calT?, lineStyle? }
measure    { sub: distance|width|depth|area, from,to | pts, metres, units }
clip.edit  { segs: [{id,a,b,speed,trans}], freezes: [{id,t,hold}], texts: [{id,a,b,text,pos,color,rev}], mute }
byMatch.cal { t, H, pts, L, W }
```

- Spotlight cũ không có `look` nên vẫn vẽ vòng tròn như trước.
- Clip không có `edit` xuất đúng như trước: `planOf` coi nó là một đoạn tốc độ 1.
- Đồng hồ của mọi mốc là đồng hồ của file, như `r.t`.

## 6. Bám theo keyframe

`resolved(s, now)` trả hình đã nội suy tại `now`. Đây là chỗ duy nhất, và màn hình, mặt nạ dim,
PNG, MP4 đều đi qua nó, nên không thể lệch nhau. `paint` dựng lại node khi `rev` hoặc `geoKey`
đổi. Hình không có keyframe có `geoKey` rỗng nên khung không đổi gì thì không chạm DOM.

## 7. Căn sân

`homography` giải hệ 8×8 (DLT) từ 4 điểm ảnh sang toạ độ sân, có pivot và chuẩn hoá toạ độ ảnh.
Từ chối khi 3 điểm thẳng hàng hoặc 2 điểm trùng. Căn sân gắn với khung `cal.t`:

- `calOk(now)`: `|now − cal.t| ≤ 1 s`.
- Ngoài khoảng đó Measure đòi căn lại, hoặc bấm *Camera hasn't moved* để gắn lại vào khung hiện tại.
- Phần mềm không phát hiện được camera lia. Đây là lý do số đo luôn có `≈`.
- Khoảng cách trên Link chỉ hiện trong 1 s quanh khung đã căn.

## 8. Export

Vẫn là một pipeline: canvas → MediaRecorder → file. `planOf(a, b, edit, shapes)` cho danh sách
đoạn, các điểm dừng và tổng thời lượng ra file.

- Đoạn liền nhau: đổi `playbackRate` tại ranh giới.
- Đoạn không liền (đã xoá ở giữa): `rec.pause()`, seek, chờ `seeked`, `rec.resume()`, có timeout.
- Fade: dip-to-black trên canvas, `fadeAlpha` là hàm thuần của thời gian, cả preview lẫn file dùng chung.
- Mute: `GainNode` về 0, file vẫn có track âm thanh.

## 9. Tag (migration 0027)

Ba bảng: `film_tags`, `film_playlists`, `film_codes`. `film-tools.js` không gọi database trực
tiếp; nó đi qua `HNA.film` trong `supa.js`, và lời hứa "không bao giờ upload video" vẫn được test
giữ nguyên.

RLS:

| Bảng | Đọc | Ghi |
|---|---|---|
| `film_tags` | thành viên, và (`channel` hoặc của mình) | của mình; `channel` chỉ admin/analyst; admin được xoá |
| `film_playlists` | thành viên | thành viên tạo; của mình hoặc admin được sửa/xoá |
| `film_codes` | thành viên | admin/analyst tạo; admin xoá |

`match_in_club` chặn gắn tag vào trận của CLB khác. Xem CLB công khai mà không phải thành viên thì
không có tag: menu nói rõ cần đăng nhập vào channel.

Tag chỉ được tải khi vào full screen, nên một cầu thủ xem Film bình thường không phát sinh query.

## 10. Phím

Toàn màn hình: `S K N M Q A E G U` là mới. Trong editor: `X` tách, `V` chọn đoạn, `Y` thêm chữ,
`Q` thêm freeze, `[` `]` cắt đầu/cuối, `Delete` xoá mục đang chọn. Trong panel Tag: `1–9` chọn code,
`Enter` lưu. `Backspace` đóng từng lớp từ trong ra.

## 11. Không làm ở đợt này

Auto-track bằng thị giác máy tính, Voice-over, Flash/Zoom, Ramp, ghép nhiều trận vào một file,
phát tag của trận khác ngay trong trận đang mở.

## 12. Đã kiểm tra thế nào

Test tự động: `tests/film-toolkit.test.js`, chạy phần số học thật và lái các panel qua DOM stub.

Kiểm tra tay trên Chrome thật, 2026-11-06, bằng `apps/portal/demo-film.html` qua `demo-serve.js`
(cần server có Range, `python -m http.server` không seek được):

| Việc | Kết quả đo |
|---|---|
| Keyframe tại 20 s và 22 s, xem ở 21 s | `cx` trên màn hình đúng bằng điểm giữa hai key |
| Căn sân bằng 4 góc vòng cấm, đo góc trái tới góc phải | đúng 72 m |
| Preview: 50–52 → bỏ 52–54 → 54–56 ở 0.5× → freeze 55 s | nhảy qua đoạn bỏ, tốc độ 0.5, dừng tại 55.01 |
| Xuất kế hoạch 9.0 s (A 2 s, B 4 s + hold 2 s, C 1 s) | file H.264/Opus 1280×720 dài 9.19 s; đen tại điểm fade, có chữ chú thích |
| Xuất clip thường có spotlight bám | 3.02 s cho clip 3 s; vòng và nhãn nằm đúng trong file |
| Đổi hiệp khi đang mở editor | từ chối bằng thông báo, không vỡ |
| Đổi bộ lọc khi đang mở editor | editor quay lại đúng clip |
| Thoát full screen khi đang mở panel | không còn phần tử nào, `playbackRate` và `muted` trả về như cũ |
| Màn hình 1280×640 | menu cuộn được, submenu nằm trong màn hình |
| Portal thật, chưa đăng nhập, channel công khai | không lỗi trang, không request tới bảng `film_*`, Tag báo cần đăng nhập |

**Chưa kiểm được ngoài đời:** luồng Tag với tài khoản thật của channel. Panel Tag đã chạy với data
layer giả lập; RLS cần được thử sau khi migration 0027 được áp dụng.
