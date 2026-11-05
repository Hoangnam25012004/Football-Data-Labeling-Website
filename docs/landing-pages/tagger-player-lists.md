# Tagger: Danh sách cầu thủ và đội hình (Player-Lists)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/tagger/Player-Lists/#match=<code>`, mở bằng nút 👥 Player lists của tab gắn nhãn (tab mới) |
| File nguồn | [`apps/tagger/Player-Lists/index.html`](../../apps/tagger/Player-Lists/index.html): HTML và ~570 dòng JS inline |
| Script | `../auth.js`, `supabase-js@2.118.0`, `../shared.js?v=29` |
| CSS | `../shared-page.css`, `../shared.css` |
| Người dùng | Analyst |
| Đăng nhập | Bắt buộc |
| Design doc | [`submit-lineup-design.md`](../design/submit-lineup-design.md), [`player-identity-and-gk-design.md`](../design/player-identity-and-gk-design.md) |

Trang nhập đội hình cho **một trận**: chọn cầu thủ từ danh sách của đội trong DB, gán số áo của
trận này, xếp đá chính và dự bị, kéo chấm lên sơ đồ sân, rồi **⇪ Submit** để gửi sang tab gắn
nhãn. Có đội hình thì cổng kiểm tra số áo, phút thi đấu và đội hình trên Stats mới hoạt động.

**Mọi chỉnh sửa vào bản nháp trước.** Tab gắn nhãn và match row chỉ nhận đội hình khi bấm
Submit.

## 1. Bố cục

| ID | Phần tử |
| --- | --- |
| `luHomeBtn` / `luAwayBtn` | Chọn đội đang sửa |
| `luSubmitBtn` (menu) với `luSubmitHome` / `luSubmitAway` | ⇪ Submit từng đội |
| `dbName` + `dbAdd` | Thêm cầu thủ mới |
| `dbSearch` | Tìm trong danh sách |
| `poolAll` | Danh sách cầu thủ của đội (bảng sắp xếp được) |
| Danh sách cuối | Đá chính và dự bị |
| Sơ đồ sân | Chấm của đá chính, kéo được |
| `luDir` | ⇄ Switch Attacking Direction |

## 2. Chức năng

### 2.1 Nạp đội hình của trận

[`loadMatchLineups`](../../apps/tagger/Player-Lists/index.html#L243) đọc `matches.lineups`
(nguồn chuẩn) và chỉ dùng bản lưu local khi không có bản trên cloud. Bản nháp được đánh dấu theo
trận ([`draftStamp`](../../apps/tagger/Player-Lists/index.html#L121),
[`loadDraft`](../../apps/tagger/Player-Lists/index.html#L123)), nên không bao giờ lấy nhầm
đội hình của trận khác.

### 2.2 Danh sách cầu thủ của đội (pool)

- [`initDB`](../../apps/tagger/Player-Lists/index.html#L295) và
  [`loadDbPlayers`](../../apps/tagger/Player-Lists/index.html#L309) đọc
  `players (id, name, position)` theo `team_id` của đội ([`teamIdFor`](../../apps/tagger/Player-Lists/index.html#L293)).
- [`poolRows`](../../apps/tagger/Player-Lists/index.html#L324): đội hình trong DB, cộng những
  người đã có trong trận này. Vị trí hiển thị là ô trên sân nếu có, không thì lấy vị trí trong
  DB ([`posOf`](../../apps/tagger/Player-Lists/index.html#L338)).
- Sắp xếp theo cột: [`sortRows`](../../apps/tagger/Player-Lists/index.html#L342),
  [`markSortHeaders`](../../apps/tagger/Player-Lists/index.html#L355). Vẽ:
  [`renderPool`](../../apps/tagger/Player-Lists/index.html#L362). Tìm kiếm qua `dbSearch`.

### 2.3 Thêm cầu thủ

[`addPlayer`](../../apps/tagger/Player-Lists/index.html#L500): nếu đội đã liên kết với DB thì
`insert` vào `players` (`position:null`), không thì chỉ thêm vào trận này. Tên được tách thành
họ và tên ([`splitName`](../../apps/tagger/Player-Lists/index.html#L151)).

### 2.4 Đá chính, dự bị, số áo

| Thao tác | Function |
| --- | --- |
| Chọn vào trận: hỏi số áo **của hôm nay** và từ chối số trùng | [`pick`](../../apps/tagger/Player-Lists/index.html#L465), [`askNo`](../../apps/tagger/Player-Lists/index.html#L441), [`addToLineup`](../../apps/tagger/Player-Lists/index.html#L453) (vào đá chính cho tới khi đủ người, sau đó vào dự bị) |
| Bỏ ra khỏi trận | [`unpick`](../../apps/tagger/Player-Lists/index.html#L474) |
| Chuyển sang dự bị / đá chính | [`toSub`](../../apps/tagger/Player-Lists/index.html#L481), [`toXI`](../../apps/tagger/Player-Lists/index.html#L485) |
| Đổi số áo trong trận | [`changeNo`](../../apps/tagger/Player-Lists/index.html#L491) |
| Vẽ danh sách cuối | [`renderFinal`](../../apps/tagger/Player-Lists/index.html#L421), [`lineupRow`](../../apps/tagger/Player-Lists/index.html#L405) |

Số người đá chính tối đa phụ thuộc vào môn, theo bảng `MAX_XI`, mặc định 11 ([`maxXI`](../../apps/tagger/Player-Lists/index.html#L147)).

### 2.5 Sơ đồ đội hình

- [`renderLuPitch`](../../apps/tagger/Player-Lists/index.html#L520) và kéo chấm
  [`luDrag`](../../apps/tagger/Player-Lists/index.html#L538).
- Cầu thủ chưa biết vị trí được đặt ở ô chờ cạnh thủ môn: cạnh LB với đội nhà, cạnh RB với đội
  khách. Thêm cả đội một lúc thì tất cả xếp chồng ở ô đó, để từ đó kéo ra.
- Thả vào một ô vị trí thì các chấm trong ô tự dàn đều: một chấm ở giữa, hai chấm ở 1/3 và 2/3,
  ba chấm ở 1/4, 1/2 và 3/4… (`arrangeXI` trong shared.js).
- **⇄ Switch Attacking Direction** ([`luSwitchDir`](../../apps/tagger/Player-Lists/index.html#L580)):
  xoay 180° ([`turnXI`](../../apps/tagger/Player-Lists/index.html#L555)), áp cho cả trận chứ
  không riêng một đội ([`faceTeam`](../../apps/tagger/Player-Lists/index.html#L570)).
- [`renderLineup`](../../apps/tagger/Player-Lists/index.html#L587) vẽ lại toàn bộ.

### 2.6 Lưu nháp và ⇪ Submit

| Function | Chức năng |
| --- | --- |
| [`save`](../../apps/tagger/Player-Lists/index.html#L163) | Mọi chỉnh sửa đều qua đây, và **chỉ ghi vào bản nháp** ([`saveDraftLS`](../../apps/tagger/Player-Lists/index.html#L137): ghi dấu trận trước, rồi mới ghi bản nháp) |
| [`setSaveStatus`](../../apps/tagger/Player-Lists/index.html#L156) | Trạng thái lưu |
| [`dirtyTeams`](../../apps/tagger/Player-Lists/index.html#L219), [`renderSubmitState`](../../apps/tagger/Player-Lists/index.html#L224) | Chấm báo đội nào có bản nháp khác với bản tab gắn nhãn đang dùng |
| [`setSubmitOpen`](../../apps/tagger/Player-Lists/index.html#L615) | Mở/đóng menu ⇪ Submit |
| [`publishTeam`](../../apps/tagger/Player-Lists/index.html#L176) | Gửi **một** đội sang tab gắn nhãn qua localStorage (`pitchtagger.lineups.v1` kèm dấu trận), và lên match row |
| [`pushPublished`](../../apps/tagger/Player-Lists/index.html#L202) | Phần cloud: `matches.update({lineups})`, nên không phụ thuộc tab gắn nhãn có đang mở hay không |

Tab gắn nhãn nhận đội hình qua sự kiện `storage` hoặc realtime, rồi dùng nó cho cổng số áo, thay
người và sơ đồ trên video.

## 3. Dữ liệu

| Nơi | Khoá / bảng | Đọc/Ghi |
| --- | --- | --- |
| localStorage | `pitchtagger.lineups.draft.v1` + `pitchtagger.lineups.draft.match.v1` (bản nháp và dấu trận của nó) | Đọc/Ghi |
| localStorage | `pitchtagger.lineups.v1` + `pitchtagger.lineups.match.v1` | Ghi khi Submit |
| localStorage | `pitchtagger.meta.v1`, `pitchtagger.cloud.cfg` | Đọc |
| Supabase | `matches.lineups` | Đọc khi tải, ghi khi Submit |
| Supabase | `players` | Đọc theo đội, thêm cầu thủ mới |

Cấu trúc `lineups`: `{home:{roster,xi,subs,dir}, away:{…}, history:[snapshot…]}` (`blankTeamLU` trong shared.js). Mỗi snapshot trong `history` là **toàn bộ** đội hình của một đội tại một thời điểm, không phải một thay đổi. Lịch sử
thay người (`history`) do tab gắn nhãn ghi; trang này sửa đội hình xuất phát.

## 4. Liên kết

"← Tagging" quay về tab gắn nhãn kèm `#match=` ([`syncBackLink`](../../apps/tagger/shared.js#L79)
trong shared.js).

## 5. Lưu ý khi sửa

- Logic dàn chấm (`arrangeXI`) và xoay sân (`turnXI`, `faceTeam`) có **hai bản**: một trong trang
  này và `shared.js`, một trong `index.html` của tab gắn nhãn. `tests/formation-arrange.test.js`
  kiểm tra hai bản không lệch nhau.
- Thứ tự ghi "dấu trước, dữ liệu sau" là có chủ đích: tab nhận sự kiện `storage` luôn thấy dấu
  khớp với dữ liệu.
- Test: `submit-lineup`, `squad`, `lineup-store`, `attack-direction`, `formation-arrange`,
  `match-save`, `no-match-tabs`.
