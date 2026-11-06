# Portal: Channel app

| | |
| --- | --- |
| URL live | `https://hoangnams.com/app.html` (điều hướng bằng hash: `#/home`, `#/match/<slug>`, `#/data/...`, `#/channel/...`) |
| File nguồn | [`apps/portal/app.html`](../../apps/portal/app.html) (khung) · [`assets/app.js`](../../apps/portal/assets/app.js) (toàn bộ logic, ~2600 dòng) · [`assets/supa.js`](../../apps/portal/assets/supa.js) (lớp dữ liệu `window.HNA`) |
| Nạp động | Khi mở trận: `tagger/shared.js`, `tagger/Stats/stats-view.{js,css}`, `tagger/Stats/report.js`, `assets/film-tools.{js,css}`, `xlsx`. Khi mở Data: chỉ `shared.js`. |
| CSS | `site.css`, `app.css`, `app-mobile.css` (chỉ áp cho màn ≤720px) |
| Người dùng | Thành viên CLB. Channel public thì ai cũng đọc được. |
| Đăng nhập | Không bắt buộc. Quyền đọc do RLS của Supabase quyết định. |
| Design doc | [`mobile-ui-design.md`](../design/mobile-ui-design.md), [`match-edit-design.md`](../design/match-edit-design.md), [`player-data-design.md`](../design/player-data-design.md), [`player-season-table-design.md`](../design/player-season-table-design.md), [`player-role-cards-design.md`](../design/player-role-cards-design.md), [`film-*-design.md`](../design/) |

**Một channel là một CLB.** Thành viên đã đăng nhập chỉ thấy channel mình thuộc về, và chỉ
thấy những trận analyst đã **publish** (⇪ Submit Analysis trong tagger). App không bao giờ đọc
`public.events`: mọi con số đều lấy từ ảnh chụp trong `public.match_reports`.

## 1. Khung (shell) và khởi động

### 1.1 Khởi động: [`boot()`](../../apps/portal/assets/app.js#L35)

1. `HNA.auth.user()` đọc phiên (nếu có).
2. Đã đăng nhập thì **`HNA.channels.claim()`** trước (`rpc claim_club_invites`: đổi lời mời
   theo email thành membership), rồi mới `HNA.clubs()`. Chưa đăng nhập thì gọi thẳng
   `HNA.clubs()`, vì channel public vẫn đọc được.
3. Chọn channel: lấy theo `?club=<slug>` trên URL, không có thì lấy channel đầu tiên.
4. [`loadMatches(ch)`](../../apps/portal/assets/app.js#L72) gọi `HNA.matches(ch.id, ch.code)`
   và xoá cache tổng hợp của channel cũ.
5. [`renderShell()`](../../apps/portal/assets/app.js#L116) rồi [`route()`](../../apps/portal/assets/app.js#L153).
6. Lỗi ở bước nào thì app vẫn hiện được ở trạng thái "không có channel".

### 1.2 Header

| Phần tử | Chức năng |
| --- | --- |
| `#chanBtn` / `#chanMenu` | Bộ chọn channel. Mỗi channel là một nút, chọn thì `loadMatches` và về `#/home`. |
| `#who` | "Signed in as …" hoặc "Not signed in" |
| `#avatar` | [`showAvatar(user)`](../../apps/portal/assets/app.js#L97): ảnh từ Google (`avatar_url`/`picture`, gán `img.src` dạng property, `referrerPolicy=no-referrer`). Không có ảnh hoặc ảnh lỗi thì hiện chữ cái đầu của email. |
| `#signIn` / `#signOut` | Hiện tuỳ trạng thái. Sign out gọi `HNA.auth.signOut()` rồi về `login.html`. |

### 1.3 Thanh bên (rail)

Ba mục: **Home** (`#/home`), **Channel** (`#/channel`), **Data** (`#/data`).

- Nút `#railToggle` thu hẹp hoặc mở rộng rail: [`setRail`](../../apps/portal/assets/app.js#L2528)
  và [`restoreRail`](../../apps/portal/assets/app.js#L2546). Trạng thái lưu ở
  `localStorage['hna.rail']` (`in`/`out`) và được khôi phục trước lần vẽ đầu tiên.
- Khi rail thu hẹp trên màn ≥861px, tên mục chuyển vào tooltip.
- Dưới 861px, rail thành một hàng ngang trên đầu trang.

### 1.4 Router: [`route()`](../../apps/portal/assets/app.js#L153)

| Hash | View |
| --- | --- |
| `#/home` (mặc định) | `renderMatches` |
| `#/matches` | Chuyển hướng sang `#/home` (giữ bookmark cũ) |
| `#/match/<slug>` (cùng mọi hậu tố khác `/edit`) | `renderMatchStats` (Analysis) |
| `#/match/<slug>/edit` | `renderMatchEdit` |
| `#/data`, `#/data/team/<cat>`, `#/data/player[/<key>[/<cat>]]` | `renderData` |
| `#/players` | `renderPlayers` (không có mục trên rail, giữ lại cho link cũ) |
| `#/channel`, `#/channel/new`, `#/channel/<slug>`, `#/channel/<slug>/edit` | `renderChannel` |

Trước mỗi lần đổi view, router gọi `PTStats.destroy()` nếu Stats đang được mount, để dừng
video Film, vòng lặp vẽ và các listener trên `document`.

## 2. Home: danh sách trận

[`renderMatches(view)`](../../apps/portal/assets/app.js#L200)

- Mỗi trận là một nút `.mrow`, gồm ngày, đội nhà, tỉ số, đội khách và
  [`detailsCell(m)`](../../apps/portal/assets/app.js#L299) (league · season · round · venue,
  phần nào trống thì bỏ). Bấm vào thì mở `#/match/<slug>`.
- Chưa có trận nào thì hiện empty state *"No matches published yet"*. Không có channel thì
  dùng [`noChannel()`](../../apps/portal/assets/app.js#L354), phân biệt *Not signed in* với
  *No channel yet*.
- **Menu ⋯ cho từng trận**, chỉ hiện với admin của channel:
  [`matchMenu(m)`](../../apps/portal/assets/app.js#L320) có mục **Edit** (Date, league,
  season, round), dẫn tới `#/match/<slug>/edit`. Cả danh sách dùng chung một listener trên
  `document` để đóng menu khi bấm ra ngoài.

Đội nào là "của mình" trong trận do `resolveSide()` trong supa.js xác định, theo team code
của channel (migration 0018). Không có team code thì dùng `our_side`.

## 3. Analysis: phân tích một trận

[`renderMatchStats(view, slug)`](../../apps/portal/assets/app.js#L377)

1. Nút **← All matches** quay về.
2. Gọi song song [`loadStatsView()`](../../apps/portal/assets/app.js#L1921) (nạp `shared.js`,
   `stats-view.css`, `stats-view.js` rồi `report.js`, qua [`loadOnce`](../../apps/portal/assets/app.js#L1891))
   và `HNA.report(m.uuid)`, tức bản `match_reports` mới nhất.
3. Chưa có báo cáo thì hiện *"No analysis submitted yet"*.
4. Đè meta sống của trận (ngày, league, season, round, venue mà channel đã sửa) lên meta
   trong payload.
5. `PTStats.mount(holder, rep.payload, { fullscreen: true, guide: 'guide.html' })`.
6. Gắn nút **⭳ PDF** (`PTReport`).
7. URL có `?t=<giây>` (link "Copy a link to this moment" từ Film) thì tự bấm tab **Film**,
   và `film-tools.js` seek tới giây đó.

**Nội dung bên trong là toàn bộ trang Stats.** Xem [tagger-stats.md](tagger-stats.md) cho
4 view (Overall, Dashboard, Stats, Film), 6 category và các export XLSX/CSV/PDF. So với
trang Stats của tagger, bản trong portal khác ở 3 điểm:

| | Stats trong tagger | Analysis trong portal |
| --- | --- | --- |
| Nguồn dữ liệu | localStorage của tab gắn nhãn, hoặc cloud qua `#match=` (sống) | Một payload `match_reports` (đóng băng) |
| Full screen ở Film | Không | Có (`fullscreen:true`), kèm link Guidelines tới `guide.html` |
| Bộ công cụ analyst ([`film-tools.js`](../../apps/portal/assets/film-tools.js)) | Không nạp | Có (mục 3.1) |

[`taggerRoot()`](../../apps/portal/assets/app.js#L1886) trả về `'tagger/'` trên site live và
`'../tagger/'` khi chạy local từ `/apps/portal/`.

### 3.1 Bộ công cụ Film cho analyst ([`film-tools.js`](../../apps/portal/assets/film-tools.js))

File này chỉ được nạp ở portal. `stats-view.js` biết đến nó qua 4 lời gọi
([`attach`](../../apps/portal/assets/film-tools.js#L4239), `relayout`, `onMeta`,
[`detach`](../../apps/portal/assets/film-tools.js#L4291)) và
[`frame`](../../apps/portal/assets/film-tools.js#L4327) mỗi khung hình. Ba nguyên tắc của nó:
**không bao giờ upload, không ghi video, không tự hiện ra** khi chưa ai dùng.

**Menu chuột phải** (chỉ có trong full screen), do [`menuModel`](../../apps/portal/assets/film-tools.js#L3873)
và [`openMenu`](../../apps/portal/assets/film-tools.js#L4010) dựng:

| Nhóm | Mục (phím tắt) |
| --- | --- |
| Đầu menu | Đồng hồ trận, tên hiệp, chip `Event: #n` (cầu thủ của event gần nhất trong ±6 s) |
| Hàng transport | Step back one frame (`,`) · Play / pause (`Space`) · Step forward one frame (`.`) · Speed ▸ 0.25× / 0.5× / 1× / 1.5× / 2× · Loop A–B (`L`) · Dim / Undim (`D`) |
| Telestration | Spotlight & track player (`S`) · Link players (`K`) · Defensive line (`N`) · Measure ▸ Distance, Width, Depth, Area, Calibrate the pitch here (`M`) · Draw ▸ Arrow, Curved arrow, Dashed arrow, Freehand, Zone, Text, Player marker, Undo (`U`), Clear all · Freeze here & draw (`Q`) · Zoom in here |
| Sửa hình (khi bấm trúng một hình) | Drawing here: … ▸ Select to edit · Time window 1–10 s (phím `1`–`9`) · 📌 Keep for the whole clip (`0`) · Freeze frame on export · Colour · Delete (`Del`) |
| Clip | Hàng tile: Split (`X`), In (`[`), Out (`]`), ±6 s (`A`), Speed (`V`) · Open clip editor (`E`) · Clip list… (`C`) |
| Tag & Share | Tag this moment (`G`) · Add to playlist ▸ · Export ▸ Save this frame (.png), Download the marked section (.mp4) · Copy a link to this moment |
| Footer | Drawings (`H`) · Timeline (`T`) · Exit (`Esc`) |

Thiết kế và các điểm khác Figma: [film-analyst-toolkit-design.md](../design/film-analyst-toolkit-design.md).

Các function chính:

- **Toạ độ:** mọi hình vẽ lưu theo **pixel của chính video**, không theo pixel màn hình
  ([`pictureRect`](../../apps/portal/assets/film-tools.js#L435), [`toVideo`](../../apps/portal/assets/film-tools.js#L448)).
  Vì vậy hình vẽ đứng yên khi đổi kích thước cửa sổ và khớp với file export.
- **Lớp vẽ:** [`ensureLayer`](../../apps/portal/assets/film-tools.js#L463) tạo một SVG phủ
  lên khung hình. [`shapeNode`](../../apps/portal/assets/film-tools.js#L740) là renderer
  dùng chung cho màn hình và cả hai kiểu export. [`paint`](../../apps/portal/assets/film-tools.js#L895)
  đối chiếu thay đổi chứ không dựng lại từ đầu.
- **Thời gian sống của hình:** [`liveAt`](../../apps/portal/assets/film-tools.js#L819) và
  [`alpha`](../../apps/portal/assets/film-tools.js#L834). Mỗi hình chỉ hiện trong cửa sổ thời
  gian của nó, có thể ghim (`togglePin`) hoặc đổi độ dài (`setDur`). Làn timeline phía trên
  khung hình hiện các cửa sổ đó thành thanh ([`toggleStrip`](../../apps/portal/assets/film-tools.js#L1484),
  [`renderStrip`](../../apps/portal/assets/film-tools.js#L1419)).
- **Text:** [`textAt`](../../apps/portal/assets/film-tools.js#L1492) đặt một ô nhập thật tại
  chỗ bấm, không dùng `prompt()` (vì `prompt()` làm thoát full screen).
- **Phát chậm và từng khung:** [`step`](../../apps/portal/assets/film-tools.js#L1543),
  [`setSpeed`](../../apps/portal/assets/film-tools.js#L1548). Số fps được đo bằng
  `requestVideoFrameCallback` ([`measureFps`](../../apps/portal/assets/film-tools.js#L1557)).
- **Spotlight:** [`paintDim`](../../apps/portal/assets/film-tools.js#L878) làm tối màn hình
  và khoét lỗ tại mỗi spotlight. Kéo hoặc lăn chuột để chỉnh ([`onWheel`](../../apps/portal/assets/film-tools.js#L1343)).
- **Zoom:** lăn chuột khi không chỉnh spotlight ([`zoomBy`](../../apps/portal/assets/film-tools.js#L553),
  [`applyZoom`](../../apps/portal/assets/film-tools.js#L521)).
- **Clip và playlist:** [`markAt`](../../apps/portal/assets/film-tools.js#L1586),
  [`saveClip`](../../apps/portal/assets/film-tools.js#L1625),
  [`clipFromEvent`](../../apps/portal/assets/film-tools.js#L1643) (±6s quanh một event đã tag),
  [`playClip`](../../apps/portal/assets/film-tools.js#L1665),
  [`playAll`](../../apps/portal/assets/film-tools.js#L1674),
  ngăn kéo clip ([`togglePanel`](../../apps/portal/assets/film-tools.js#L3598)).
- **Export:** [`savePNG`](../../apps/portal/assets/film-tools.js#L1734) và
  [`exportClip`](../../apps/portal/assets/film-tools.js#L1844) (.mp4 render ngay trong trình
  duyệt và lưu xuống máy; [`corsUrl`](../../apps/portal/assets/film-tools.js#L1821) né cache
  không có CORS).
- **Link tới khoảnh khắc:** [`momentLink`](../../apps/portal/assets/film-tools.js#L3840) tạo
  URL `?t=<giây>`.
- **Bàn phím:** [`key`](../../apps/portal/assets/film-tools.js#L4129) nhận các phím ở bảng
  trên. Còn Space, ←/→, `F` (full screen) và `Esc` do `filmKeys` của stats-view xử lý.
- **Lưu trữ:** [`loadStore`/`saveStore`](../../apps/portal/assets/film-tools.js#L445) ghi
  hình vẽ, clip và căn sân vào `localStorage['hna.film.tools.v1']`, khoá theo trận. **Chỉ nằm
  trong trình duyệt**, không đồng bộ cloud. Tag là ngoại lệ duy nhất (xem dưới).
- **Inspector:** [`openInsp`](../../apps/portal/assets/film-tools.js#L2344) và
  [`renderInsp`](../../apps/portal/assets/film-tools.js#L2378). Panel là con của `#fmStage` nên không che
  cột phải, kéo được bằng tiêu đề ([`inspGrab`](../../apps/portal/assets/film-tools.js#L2410)), và chặn
  sự kiện ở chính nó ([`fenceUi`](../../apps/portal/assets/film-tools.js#L2339)).
- **Bám keyframe:** [`resolved`](../../apps/portal/assets/film-tools.js#L183) trả hình đã nội suy tại một
  thời điểm; màn hình, mặt nạ dim, PNG và MP4 đều đi qua nó. Bật/tắt bằng
  [`setTrack`](../../apps/portal/assets/film-tools.js#L2176), thêm key khi kéo bằng
  [`placeAdjust`](../../apps/portal/assets/film-tools.js#L2163). Không có thị giác máy tính.
- **Link players:** [`startLink`](../../apps/portal/assets/film-tools.js#L2107),
  [`collectPoint`](../../apps/portal/assets/film-tools.js#L2141),
  [`finishCollect`](../../apps/portal/assets/film-tools.js#L2126), vẽ bằng
  [`linkNode`](../../apps/portal/assets/film-tools.js#L630) (chain, defensive line, shape).
- **Căn sân và đo:** [`homography`](../../apps/portal/assets/film-tools.js#L213) (4 điểm, DLT),
  [`pitchMarks`](../../apps/portal/assets/film-tools.js#L262) (mốc theo luật sân),
  [`calOk`](../../apps/portal/assets/film-tools.js#L2225) (chỉ tin trong 1 s quanh khung đã căn),
  [`measureValue`](../../apps/portal/assets/film-tools.js#L2288). Số đo luôn có dấu `≈`.
- **Clip editor:** [`openEditor`](../../apps/portal/assets/film-tools.js#L2772),
  [`renderEditor`](../../apps/portal/assets/film-tools.js#L2978). Mô hình `clip.edit`:
  [`splitAt`](../../apps/portal/assets/film-tools.js#L304),
  [`trimSeg`](../../apps/portal/assets/film-tools.js#L314),
  [`dropSeg`](../../apps/portal/assets/film-tools.js#L322),
  [`syncClip`](../../apps/portal/assets/film-tools.js#L329). Preview:
  [`runEdit`](../../apps/portal/assets/film-tools.js#L3269), [`editPeek`](../../apps/portal/assets/film-tools.js#L2900).
  Render: [`planOf`](../../apps/portal/assets/film-tools.js#L351) và
  [`fadeAlpha`](../../apps/portal/assets/film-tools.js#L337), dùng chung cho preview và file.
- **Tag và playlist:** [`openTag`](../../apps/portal/assets/film-tools.js#L3351),
  [`saveTagForm`](../../apps/portal/assets/film-tools.js#L3394),
  [`loadTags`](../../apps/portal/assets/film-tools.js#L3325). Đi qua `HNA.film` trong
  [`supa.js`](../../apps/portal/assets/supa.js), tới các bảng `film_tags`, `film_playlists`, `film_codes`
  (migration 0027). `app.js` báo CLB, trận và vai trò qua `PTFilmTools.setScope` ngay trước `mount`.
  Chỉ tải khi vào full screen và là thành viên channel; lỗi tải không hiện cho người đang xem, chỉ
  báo khi analyst mở Tag.

## 4. Sửa thông tin trận

[`renderMatchEdit(view, slug)`](../../apps/portal/assets/app.js#L480) và
[`matchForm(view, opts)`](../../apps/portal/assets/app.js#L522)

- Chỉ admin của channel mới thấy form. Người khác thấy *"Not an admin of this channel"*.
- Các trường: ngày (`kickoff`/`match_date`), league, season, round, venue. **Không** sửa được
  tỉ số, kết quả, cờ publish hay channel của trận.
- Datalist gợi ý những giá trị channel đã từng dùng ([`seasonsOf`](../../apps/portal/assets/app.js#L457),
  [`valuesOf`](../../apps/portal/assets/app.js#L469)).
- Lưu bằng `HNA.match.update(uuid, fields)` ([supa.js:516](../../apps/portal/assets/supa.js#L516)).
  Hàm này chỉ ghi 6 cột trong whitelist, đúng bằng các cột migration 0023/0024 cấp quyền
  `UPDATE`. Ô để trống được ghi thành `null`. Lưu xong thì đọc lại danh sách trận và về `#/home`.

## 5. Data: tổng hợp cả mùa

[`renderData(view)`](../../apps/portal/assets/app.js#L638). Có 3 tab ([`dataTabs`](../../apps/portal/assets/app.js#L678)):
**Overview**, **Team Data**, **Player Data**. Tất cả được tính từ các `match_reports` của
channel qua `shared.js` (`computeStats`, `sumTeam`, `TEAM_SECTIONS`, `PLAYER_CATS`), nên luôn
khớp với số trong Analysis.

- Nguồn: [`dataSource`](../../apps/portal/assets/app.js#L713) gọi `HNA.reports(uuids)`.
  [`aggregate(m)`](../../apps/portal/assets/app.js#L743) rút gọn một trận,
  [`aggregates()`](../../apps/portal/assets/app.js#L776) gom cả channel, và
  [`totalOf`](../../apps/portal/assets/app.js#L783) cộng dồn. Tỉ lệ phần trăm được tính bằng
  tỉ số của tổng, không phải trung bình của các tỉ lệ.

### 5.1 Overview: [`renderOverview`](../../apps/portal/assets/app.js#L793)

- 6 KPI: Matches tagged, Goals for, Goals against (kèm hiệu số), Shots (on target),
  Passes (% hoàn thành), Possession.
- Thẻ **Team stats**, gồm cả thẻ vàng/đỏ ([`discipline`](../../apps/portal/assets/app.js#L867),
  dùng `classifyCards` của shared.js).
- **Recent results**: 5 trận gần nhất, bấm vào để mở trận
  ([`recentResultsCard`](../../apps/portal/assets/app.js#L885)).
- **Key players** ([`keyPlayersRow`](../../apps/portal/assets/app.js#L958),
  [`playerTally`](../../apps/portal/assets/app.js#L936)) dạng thẻ, không phải link.

### 5.2 Team Data: [`renderTeamData`](../../apps/portal/assets/app.js#L1018)

- Mỗi trận một dòng. Các cột cố định là ngày, đối thủ, kết quả, tỉ số, possession, rồi đến
  các cột của section tương ứng trong `TEAM_SECTIONS` ([`sectionCols`](../../apps/portal/assets/app.js#L985)).
  Dòng cuối là tổng cả mùa.
- 6 tab category ([`catTabs`](../../apps/portal/assets/app.js#L697), danh sách `TD_TABS`):
  Shooting, Distribution, Defensive, Goalkeeper, Set Pieces, Fouls. URL dạng
  `#/data/team/<cat>`, gửi link được.
- Bấm vào một dòng thì mở trận đó.

### 5.3 Player Data: [`renderPlayerData`](../../apps/portal/assets/app.js#L1417)

- **Danh sách:** [`renderPlayerList`](../../apps/portal/assets/app.js#L1469) và
  [`playerTable`](../../apps/portal/assets/app.js#L1484) hiện mọi cầu thủ của đội mình qua
  mọi trận đã submit.
- **Một cầu thủ là một người, không phải một số áo** ([`playerIndex`](../../apps/portal/assets/app.js#L1249),
  [`aliasMap`](../../apps/portal/assets/app.js#L1209)). Cầu thủ đổi số áo giữa các đợt tập
  trung vẫn gộp về một dòng, nhờ `pid` hoặc tên trong đội hình.
- **Hồ sơ** `#/data/player/<key>/<cat>` ([`renderPlayerProfile`](../../apps/portal/assets/app.js#L1511)):
  - [`playerHead`](../../apps/portal/assets/app.js#L1702): tên, vai trò và dropdown chuyển sang cầu thủ khác.
  - [`seasonCard`](../../apps/portal/assets/app.js#L1594): 4 cột giống nhau cho mọi vị trí,
    nhóm theo league/season ([`seasonRows`](../../apps/portal/assets/app.js#L1557)).
  - [`positionBoard`](../../apps/portal/assets/app.js#L1641): sơ đồ sân với một chấm ở mỗi ô
    vị trí từng đá (lưới `FORMATION_GRID`).
  - [`playerMatchTable`](../../apps/portal/assets/app.js#L1775): mỗi trận một dòng, cột
    Possession được thay bằng Minutes Played, dòng cuối là tổng.
- **Phút thi đấu:** [`minsTotal`](../../apps/portal/assets/app.js#L1386) và
  [`minsOne`](../../apps/portal/assets/app.js#L1410). Hiện "—" khi chưa có đội hình, và "~"
  khi phút được tính theo đồng hồ video vì không có mốc Duration.
- **Thủ môn:** [`gkFigures`](../../apps/portal/assets/app.js#L1133) tính số bàn thua và clean
  sheet khi anh ta có mặt trên sân. [`gkCell`](../../apps/portal/assets/app.js#L1461) không bao
  giờ hiện 0 khi thiếu dữ liệu.

## 6. Channel: quản lý CLB

[`renderChannel(view, rest)`](../../apps/portal/assets/app.js#L1963). Cần migration
`0014_channel_admin.sql`; thiếu migration thì view báo cần chạy file nào.

| Route | Function | Chức năng |
| --- | --- | --- |
| `#/channel` | [`renderChannelList`](../../apps/portal/assets/app.js#L1984) | Các channel mình thuộc về, kèm vai trò ([`roleLabel`](../../apps/portal/assets/app.js#L2022)), và nút tạo mới |
| `#/channel/new` | [`renderChannelNew`](../../apps/portal/assets/app.js#L2415) | Tạo channel. Người tạo tự thành admin (trigger trong DB). |
| `#/channel/<slug>` | [`renderChannelOne`](../../apps/portal/assets/app.js#L2110) | Thành viên, lời mời, công tắc public |
| `#/channel/<slug>/edit` | [`renderChannelEdit`](../../apps/portal/assets/app.js#L2454) | Sửa channel. Slug giữ nguyên để không làm hỏng các link đã gửi. |

- **Form channel** ([`channelForm`](../../apps/portal/assets/app.js#L2318)), dùng chung cho
  tạo mới và sửa: Channel name (`ncName`), Sport (`ncSport`), Country (`ncCountry` + datalist),
  **Team code** (`ncCode`, 5 chữ số). [`lookup()`](../../apps/portal/assets/app.js#L2366) tra
  `HNA.teamByCode` để hiện tên đội khớp với mã. Team code là cách xác định đội nào là "của
  mình" trong mỗi trận.
- **Members** ([`drawMembers`](../../apps/portal/assets/app.js#L2215)): danh sách, đổi vai trò
  admin/analyst/viewer (`HNA.channels.setRole`), xoá thành viên (`removeMember`). DB chặn việc
  channel mất admin cuối cùng.
- **Invites** ([`drawInvites`](../../apps/portal/assets/app.js#L2263)): mời bằng email kèm vai
  trò (`HNA.channels.invite`, ghi vào `club_invites`) và thu hồi lời mời. **Không có email nào
  được gửi đi.** Admin tự gửi link cho người được mời; lời mời thành membership khi người đó
  đăng nhập lần đầu (`claim`).
- **Public** ([`drawPublic`](../../apps/portal/assets/app.js#L2165)): một công tắc *Who can read
  this channel*, bật thì phải xác nhận. Ghi `clubs.is_public` (migration 0017). Khi public,
  **mọi người** đọc được toàn bộ báo cáo, kể cả tên cầu thủ của cả hai đội. Tắt đi chỉ chặn
  người đọc mới.
- **Settings menu** ([`settingsMenu`](../../apps/portal/assets/app.js#L2033)): Edit và Delete.
  Delete ([`deleteChannel`](../../apps/portal/assets/app.js#L2079)) yêu cầu **gõ lại tên
  channel**, vì đây là thao tác duy nhất trên site không hoàn tác được.

## 7. Players (route ẩn)

[`renderPlayers`](../../apps/portal/assets/app.js#L1829) (`#/players`): không có mục trên rail
nhưng vẫn giữ route. Cầu thủ ghi bàn và kiến tạo hiện ở Player Data.

## 8. Lớp dữ liệu `window.HNA` ([supa.js](../../apps/portal/assets/supa.js))

| API | Bảng / RPC | Ghi chú |
| --- | --- | --- |
| `auth.session/user/signIn/signUp/signInWithGoogle/signOut` | Supabase Auth | `ROOT` được tính từ `document.currentScript.src`, nên dùng đúng cho cả login lẫn app |
| `clubs()` | `clubs`, `club_members` | `select('*')`, để vẫn chạy được khi DB chưa có cột mới |
| `channels.create/update/remove` | `clubs` | |
| `channels.members/setRole/removeMember` | `club_members` | |
| `channels.invites/invite/revokeInvite` | `club_invites` | |
| `channels.setPublic` | `clubs.is_public` | |
| `channels.claim` | `rpc claim_club_invites` | |
| `teamByCode(code)` | `teams` | |
| `match.update(uuid, fields)` | `matches` | Whitelist 6 cột |
| `matches(clubId, clubCode)` | `matches`, `teams` | `shape()` + `resolveSide()` + `statsFromView()` |
| `report(uuid)` / `reports(uuids)` | `match_reports` / `match_reports_latest` (0026; thiếu view thì đọc bảng) | Bản mới nhất của mỗi trận |

## 9. Dữ liệu trên trình duyệt

| Khoá localStorage | Mục đích |
| --- | --- |
| `sb-<ref>-auth-token` | Phiên Supabase |
| `hna.rail` | Rail thu hẹp hay mở rộng |
| `hna.film.tools.v1` | Hình vẽ và clip của Film (chỉ local) |

## 10. Lưu ý khi sửa

- CSS của portal **thua** CSS của tagger khi cùng độ ưu tiên, vì `shared.css` và
  `stats-view.css` được chèn sau. Muốn ghi đè thì dùng `body.app .x`.
- Sửa `stats-view.js`, `report.js` hay `shared.js` thì phải bump `?v=` của chúng **bên trong
  app.js**, và vì vậy phải bump luôn `app.js?v=` trong `app.html`.
- Test: `client-channels`, `data-page`, `public-channels`, `match-edit`, `team-code`,
  `player-data`, `player-role-cards`, `player-season-table`, `film-*`, `mobile-ui`, `submit-analysis`.
