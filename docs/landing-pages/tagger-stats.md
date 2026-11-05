# Tagger: Trang Stats (và tab Analysis của portal)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/tagger/Stats/#match=<code>`, mở từ nút 📊 Stats của tab gắn nhãn |
| File nguồn | [`apps/tagger/Stats/index.html`](../../apps/tagger/Stats/index.html) (khung, 79 dòng) · [`Stats/stats-view.js`](../../apps/tagger/Stats/stats-view.js) (`window.PTStats`, ~2900 dòng) · [`Stats/report.js`](../../apps/tagger/Stats/report.js) (`window.PTReport`, báo cáo PDF) · [`Stats/stats-view.css`](../../apps/tagger/Stats/stats-view.css) · [`../shared.js`](../../apps/tagger/shared.js) (engine thống kê) |
| Script | `../auth.js`, `xlsx 0.18.5`, `supabase-js@2.118.0`, `../shared.js?v=29`, `stats-view.js?v=30`, `report.js?v=44`. jsPDF và html2canvas được nạp khi bấm PDF. |
| Người dùng | Analyst (trang này). CLB cũng thấy cùng nội dung trong portal ([portal-app.md](portal-app.md), mục 3). |
| Đăng nhập | Bắt buộc (cổng `auth.js`) |
| Design doc | [`stats-tabs-split-design.md`](../design/stats-tabs-split-design.md), [`match-report-sections-design.md`](../design/match-report-sections-design.md), [`setpiece-dashboard-design.md`](../design/setpiece-dashboard-design.md), [`gk-setpiece-dashboard-design.md`](../design/gk-setpiece-dashboard-design.md), [`minutes-played-design.md`](../design/minutes-played-design.md), [`film-*-design.md`](../design/) |

**`stats-view.js` là một module, không phải một trang.** Trang Stats của tagger và tab
Analysis của portal mount **cùng một file** và chỉ khác nhau ở nguồn dữ liệu. Sửa ở đây thì
CLB thấy ngay. Yêu cầu thường trực của chủ dự án: sửa một tab thì không được làm hỏng tab khác.

## 1. Khởi tạo và API

Trang Stats mount như sau:

```js
PTStats.mount(document.querySelector('.page'), null, {chrome:false, local:true, cloud:true});
```

| API | Function | Chức năng |
| --- | --- | --- |
| `mount(el, data, opts)` | [`mount`](../../apps/tagger/Stats/stats-view.js#L2782) | `chrome:false` dùng header có sẵn trong trang. `local:true` đọc localStorage của tab gắn nhãn ([`loadLocal`](../../apps/tagger/Stats/stats-view.js#L2757)) và theo dõi thay đổi ([`watchLocalStorage`](../../apps/tagger/Stats/stats-view.js#L2623)). `cloud:true` đọc trận theo `#match=` ([`statsCloud`](../../apps/tagger/Stats/stats-view.js#L2664)). Portal gọi `mount(holder, payload, {fullscreen:true, guide:'guide.html'})`. |
| `update(data)` | [`update`](../../apps/tagger/Stats/stats-view.js#L2799) | Đổi sang trận khác nhưng giữ view, đội và category đang chọn |
| `destroy()` | [`destroy`](../../apps/tagger/Stats/stats-view.js#L2805) | Dừng Film, thoát full screen, xoá state |
| `data()` | [`data`](../../apps/tagger/Stats/stats-view.js#L2817) | `{rows, meta, lineups, dur}`, dữ liệu mà `report.js` dùng để export |
| Payload portal | [`setData`](../../apps/tagger/Stats/stats-view.js#L2769) | Nhận payload `match_reports`. Phần nào thiếu thì dùng giá trị rỗng thay vì throw. |

**Nguồn cloud của trang Stats** ([`statsCloud`](../../apps/tagger/Stats/stats-view.js#L2664)):
tìm trận theo code 5 số hoặc uuid, đăng nhập anonymous nếu chưa có phiên, rồi nạp event, đội hình
và đồng hồ, và đăng ký realtime để số liệu cập nhật theo tab gắn nhãn.

Chưa mở trận nào thì hiện `#noMatchMsg` chứ **không** hiện dữ liệu của trận trước. localStorage
được dùng chung cho mọi trận, nên chỉ đọc đội hình và đồng hồ có dấu trùng với trận đang mở
([`ourLineups`](../../apps/tagger/Stats/stats-view.js#L46), [`ourDur`](../../apps/tagger/Stats/stats-view.js#L50)).

## 2. Thanh công cụ

| ID | Chức năng |
| --- | --- |
| `viewOverallBtn` / `viewDashBtn` / `viewStatsBtn` / `viewFilmBtn` | 4 view |
| `statHomeBtn` / `statAwayBtn` (`#teamToggle`) | Chọn đội (chỉ với Dashboard và Stats) |
| `#catToggle` | 6 category: Shooting, Distribution, Defensive, Goalkeeper, Set Pieces, Fouls |
| `expXlsx` / `expCsv` / `expPdf` | Export |

Gắn handler: [`bindControls`](../../apps/tagger/Stats/stats-view.js#L2595). Vẽ lại:
[`renderStats`](../../apps/tagger/Stats/stats-view.js#L72).

## 3. View Overall

[`renderGeneral`](../../apps/tagger/Stats/stats-view.js#L1322)

- **Tóm tắt trận** ([`matchSummaryHTML`](../../apps/tagger/Stats/stats-view.js#L1405)): thanh
  tỉ số ([`scoreBarHTML`](../../apps/tagger/Stats/stats-view.js#L1372)), timeline bàn thắng,
  thẻ và thay người. Nhiều lần thay cùng lúc gộp thành một mốc `x2`/`x3`
  ([`subMarkers`](../../apps/tagger/Stats/stats-view.js#L1387)). Bù giờ hiện kiểu `45+1'`
  ([`markMin`](../../apps/tagger/Stats/stats-view.js#L1351)). Có danh sách thay người
  ([`subsPanelHTML`](../../apps/tagger/Stats/stats-view.js#L1359)).
- **Đội hình xuất phát** hai bên trên sân dọc, luôn tấn công lên trên
  ([`formationSideHTML`](../../apps/tagger/Stats/stats-view.js#L1495),
  [`pitchSVGV`](../../apps/tagger/Stats/stats-view.js#L1489)), kèm ghế dự bị
  ([`benchListHTML`](../../apps/tagger/Stats/stats-view.js#L1516)).
- **So sánh hai đội** theo từng section của `TEAM_SECTIONS` (shared.js), mỗi chỉ số là một
  thanh hai phía.
- Bàn thắng được tính bằng [`teamGoals`](../../apps/tagger/Stats/stats-view.js#L1343): bàn
  của đội cộng phản lưới của đối phương.

## 4. View Stats: bảng theo cầu thủ

[`statTableHTML`](../../apps/tagger/Stats/stats-view.js#L145)

- Cột lấy từ `PLAYER_CATS` của shared.js (`STAT_CATS`), theo category đang chọn.
- Liệt kê **cả đội hình ra sân**, kể cả cầu thủ dự bị vào sân mà chưa chạm bóng (dòng toàn 0,
  qua `withSquad`). Riêng tab Goalkeeper chỉ liệt kê những người từng bắt gôn
  ([`catPlayers`](../../apps/tagger/Stats/stats-view.js#L136)).
- **Minutes played** ([`minsCell`](../../apps/tagger/Stats/stats-view.js#L120)): "—" khi không
  có đội hình, "~" khi phải dùng đồng hồ video vì thiếu mốc Duration.

## 5. View Dashboard: biểu đồ theo category

[`dashboardHTML`](../../apps/tagger/Stats/stats-view.js#L162). Rê chuột vào một dòng xếp hạng
thì chỉ hiện dữ liệu của cầu thủ đó; mọi điểm đã được vẽ sẵn, nên không phải vẽ lại.

| Category | Nội dung | Function |
| --- | --- | --- |
| **Shooting** | Donut Goals / On target / Off target + Blocked; một bản đồ dọc vị trí sút **kèm khung thành phía trên** (điểm bóng qua vạch); xếp hạng người sút | [`shootingChartHTML`](../../apps/tagger/Stats/stats-view.js#L376), [`shotMapHTML`](../../apps/tagger/Stats/stats-view.js#L409), [`shotRankHTML`](../../apps/tagger/Stats/stats-view.js#L472), [`shotHover`](../../apps/tagger/Stats/stats-view.js#L462) |
| **Distribution** | Heatmap chạm bóng theo hiệp (All/1st/2nd) và theo cầu thủ; bản đồ Passes / Crosses / Take-ons / Step-ins (`DIST_CATS`), mũi tên thành công/hỏng | [`heatMapHTML`](../../apps/tagger/Stats/stats-view.js#L1230), [`drawHeat`](../../apps/tagger/Stats/stats-view.js#L1292), [`setHeatHalf`](../../apps/tagger/Stats/stats-view.js#L1321), [`distMapHTML`](../../apps/tagger/Stats/stats-view.js#L701), [`setDistCat`](../../apps/tagger/Stats/stats-view.js#L814), [`setDistHalf`](../../apps/tagger/Stats/stats-view.js#L815) |
| **Defensive** | Dropdown chọn hành động: Tackles, Interceptions, Clearances, Blocks, Recoveries, Physical / Loose Ball / Aerial Duels, Take-on Concern, Mistakes (`DEF_CATS`). Mỗi hành động một bản đồ dọc kèm xếp hạng, lọc theo hiệp. | [`defMapHTML`](../../apps/tagger/Stats/stats-view.js#L272), [`setDefCat`](../../apps/tagger/Stats/stats-view.js#L368), [`setDefHalf`](../../apps/tagger/Stats/stats-view.js#L369) |
| **Goalkeeper** | Details: vòng Save Rate và 5 dòng chi tiết; Event Map: khung thành và nửa sân phòng ngự; xếp hạng cầu thủ đối phương; Event List: các cú sút trúng đích phải đối mặt | [`gkDetailsHTML`](../../apps/tagger/Stats/stats-view.js#L532), [`gkMapHTML`](../../apps/tagger/Stats/stats-view.js#L563), [`gkOppRankHTML`](../../apps/tagger/Stats/stats-view.js#L616), [`gkEventListHTML`](../../apps/tagger/Stats/stats-view.js#L640), [`gkFaced`](../../apps/tagger/Stats/stats-view.js#L503) |
| **Set Pieces** | Mỗi loại một bản đồ: Freekicks (sút phạt trực tiếp vẽ bằng quả bóng), Corner Kicks, Throw-Ins, Goal Kicks (`SP_KINDS`), kèm người thực hiện. Chú thích chỉ ghi kết quả, không có dòng giải thích. | [`spMapHTML`](../../apps/tagger/Stats/stats-view.js#L912), [`spTaken`](../../apps/tagger/Stats/stats-view.js#L867), [`setSpKind`](../../apps/tagger/Stats/stats-view.js#L995), [`setSpHalf`](../../apps/tagger/Stats/stats-view.js#L996) |
| **Fouls** | Dropdown Fouls (kèm thẻ phát sinh) / Fouls Won / Offsides (`OTH_CATS`) | [`foulMapHTML`](../../apps/tagger/Stats/stats-view.js#L1007), [`plainEventMapHTML`](../../apps/tagger/Stats/stats-view.js#L1059), [`setOthCat`](../../apps/tagger/Stats/stats-view.js#L1006) |

Hướng tấn công của mỗi hiệp được suy ra từ vị trí các cú sút
([`attackDir`](../../apps/tagger/Stats/stats-view.js#L213)).

> **14 hàm phải là global** (`window.setDefHalf`, `setHeatHalf`, `shotHover`…, cuối file),
> vì bản đồ dùng handler inline (`onclick="setHeatHalf(1)"`). Thêm handler inline mới mà quên
> khai báo global thì nó chết lặng lẽ; `tests/stats-view.test.js` sẽ bắt lỗi này.

## 6. View Film: xem lại video theo event

[`renderFilm`](../../apps/tagger/Stats/stats-view.js#L1992), [`filmHTML`](../../apps/tagger/Stats/stats-view.js#L1945)

- **Nút hiệp:** mỗi hiệp là một "cửa sổ" video, tính từ mốc Duration
  ([`filmWindows`](../../apps/tagger/Stats/stats-view.js#L1644)).
- **Cue:** mỗi **entry** (không phải mỗi event) là một mốc trên timeline
  ([`filmCues`](../../apps/tagger/Stats/stats-view.js#L1686)).
- **Bộ lọc:** 3 slicer Team / Player / Event dạng checkbox
  ([`filmSlicers`](../../apps/tagger/Stats/stats-view.js#L1867),
  [`filmSlicerHTML`](../../apps/tagger/Stats/stats-view.js#L1902),
  [`filmBindSlicers`](../../apps/tagger/Stats/stats-view.js#L2312)); mỗi lần chỉ mở một slicer
  ([`filmSlicerOpen`](../../apps/tagger/Stats/stats-view.js#L2249)).
- **Danh sách event:** in giống bảng của tab gắn nhãn
  ([`filmRowsHTML`](../../apps/tagger/Stats/stats-view.js#L1850)). Dòng đang phát được tô sáng
  ([`filmMark`](../../apps/tagger/Stats/stats-view.js#L2550)).
- **Bản đồ sân chạy theo video:** chấm và bóng di chuyển
  ([`filmDraw`](../../apps/tagger/Stats/stats-view.js#L2468), [`filmBall`](../../apps/tagger/Stats/stats-view.js#L2504)),
  kèm dải chú thích ([`filmCaption`](../../apps/tagger/Stats/stats-view.js#L2520)).
- **Thanh điều khiển:** thanh tiến độ tính trong cửa sổ của hiệp
  ([`filmBar`](../../apps/tagger/Stats/stats-view.js#L2534)), tua
  ([`filmSeek`](../../apps/tagger/Stats/stats-view.js#L2406), [`filmSeekBy`](../../apps/tagger/Stats/stats-view.js#L2411)),
  phát/dừng ([`filmToggle`](../../apps/tagger/Stats/stats-view.js#L2413)). Cue đang hoạt động đi
  tiếp hoặc lùi lại theo video ([`filmAdvance`](../../apps/tagger/Stats/stats-view.js#L2435),
  [`filmRewind`](../../apps/tagger/Stats/stats-view.js#L2442)).
- **Phát:** [`filmLoop`](../../apps/tagger/Stats/stats-view.js#L2418) và
  [`filmFrame`](../../apps/tagger/Stats/stats-view.js#L2423) giữ video trong cửa sổ của hiệp.
- **Phím** ([`filmKeys`](../../apps/tagger/Stats/stats-view.js#L2362)): Space phát/dừng, ←/→ tua,
  `F` full screen, Esc thoát.
- **Full screen** (chỉ khi host bật `fullscreen`, tức là portal):
  [`filmFullToggle`](../../apps/tagger/Stats/stats-view.js#L2209). Link Guidelines hiện khi
  host truyền `guide` ([`filmGuideOK`](../../apps/tagger/Stats/stats-view.js#L2167)).
- **Bộ công cụ analyst:** host nào đăng ký `PTFilmTools` (chỉ portal) thì có
  ([`registerFilmTools`](../../apps/tagger/Stats/stats-view.js#L2108)). Xem
  [portal-app.md](portal-app.md), mục 3.1.
- [`filmStop`](../../apps/tagger/Stats/stats-view.js#L2126) giải phóng fetch, vòng lặp và
  listener trước mỗi lần vẽ lại.

## 7. Export

| Nút | Chức năng | Function |
| --- | --- | --- |
| ⭳ XLSX | 12 sheet: 6 category × 2 đội, lấy theo `STAT_CATS`. Phần trăm là ô kiểu số (`z:'0.0%'`) nên Excel sắp xếp được. Có độ rộng cột và autofilter (SheetJS 0.18.5 không hỗ trợ freeze hay tô màu). | [`buildSheets`](../../apps/tagger/Stats/stats-view.js#L1589), [`catSheet`](../../apps/tagger/Stats/stats-view.js#L1555) |
| ⭳ CSV | Một file, 12 bảng xếp chồng, mỗi bảng có tiêu đề là tên sheet. Có BOM UTF-8. Tên file `<trận>_stats.csv`. | [`buildCsv`](../../apps/tagger/Stats/stats-view.js#L1598), [`matchName`](../../apps/tagger/Stats/stats-view.js#L1602) |
| ⭳ PDF | Báo cáo A4 đầy đủ, xem mục 8 | [`PTReport.exportPdf`](../../apps/tagger/Stats/report.js#L2148) |

## 8. Báo cáo PDF ([`report.js`](../../apps/tagger/Stats/report.js))

[`buildPages`](../../apps/tagger/Stats/report.js#L2058) dựng các trang HTML A4 (794×1123 px,
stylesheet chèn bằng [`ensureCss`](../../apps/tagger/Stats/report.js#L109)).
[`exportPdf`](../../apps/tagger/Stats/report.js#L2148) chụp từng trang bằng html2canvas (scale 2),
ghép bằng jsPDF và có thanh % tiến độ. Tên file: `<trận>_Match_Report.pdf`.

Thứ tự các phần:

| Phần | Trang |
| --- | --- |
| Mở đầu | Match Timeline · Table of Contents ([`tocEntries`](../../apps/tagger/Stats/report.js#L2023)) |
| Lineups & Formation | Mỗi đội một trang |
| Attacking | Team Comparison ([`attackingComparisonPage`](../../apps/tagger/Stats/report.js#L754)) · Shots & Goals (mỗi đội) · Player Stats |
| Distribution | Team Comparison ([`distributionPage`](../../apps/tagger/Stats/report.js#L1015)) · Pass Networks ([`netMapsPage`](../../apps/tagger/Stats/report.js#L1062)) · Passes theo khung 15 phút · Passing Profile ([`scatterPage`](../../apps/tagger/Stats/report.js#L1143)) · Pass Heatmap From→To mỗi đội ([`matrixPage`](../../apps/tagger/Stats/report.js#L1149)) · Touch Heatmaps ([`heatPage`](../../apps/tagger/Stats/report.js#L1172)) · Pass Types ([`passTypesPage`](../../apps/tagger/Stats/report.js#L1186)) · Cross Maps ([`crossMapsPage`](../../apps/tagger/Stats/report.js#L1238)) · Take-ons & Step-ins ([`takeOnMapsPage`](../../apps/tagger/Stats/report.js#L1373)) · Player Stats |
| Defensive | Team Comparison ([`defensivePage`](../../apps/tagger/Stats/report.js#L1248)) · bản đồ cho từng hành động trong `DEF_CATS` ([`actionMapsPage`](../../apps/tagger/Stats/report.js#L1312)) · Profile Radar ([`radarPage`](../../apps/tagger/Stats/report.js#L1382)) |
| Goalkeeper | Team Comparison ([`gkComparisonPage`](../../apps/tagger/Stats/report.js#L1832)) · Saves mỗi đội ([`gkSavesPage`](../../apps/tagger/Stats/report.js#L1779)) |
| Set Pieces | Team Comparison ([`setPieceComparisonPage`](../../apps/tagger/Stats/report.js#L2001)) · Goal Kicks ([`goalKickPage`](../../apps/tagger/Stats/report.js#L1852)) · Free-kicks và Corners ([`spArrowPage`](../../apps/tagger/Stats/report.js#L1990)) |
| Fouls | Team Comparison ([`foulComparisonPage`](../../apps/tagger/Stats/report.js#L1550)) · Foul Maps ([`foulMapsPage`](../../apps/tagger/Stats/report.js#L1429)) · Fouls Won · Offsides ([`eventMapsPage`](../../apps/tagger/Stats/report.js#L1485)) |

Báo cáo là tài liệu CLB đọc, không phải sổ tay hướng dẫn tag, nên **không có chú thích giải
thích** trên bản đồ.

> Muốn kiểm tra PDF mà không tải file về máy: dừng ở `PTReport.buildPages(host)`. Gọi
> `exportPdf()` sẽ tải về một file thật nặng vài MB.

## 9. Engine thống kê dùng chung ([`shared.js`](../../apps/tagger/shared.js))

| Thành phần | Vai trò |
| --- | --- |
| [`EVENT_INC`](../../apps/tagger/shared.js#L212) | Mỗi event cộng vào metric nào. Ví dụ `#goal` tự tính luôn là shot và shot on target. |
| [`EV_ALIAS`](../../apps/tagger/shared.js#L367) | Gộp tên event cũ hoặc sai chính tả về tên đúng (qua `evKey`) |
| [`newStat`](../../apps/tagger/shared.js#L314), [`computeStats`](../../apps/tagger/shared.js#L442), [`statRow`](../../apps/tagger/shared.js#L455) | Tính chỉ số từng cầu thủ, chạy 3 lượt (gồm set piece và thẻ) |
| [`setPieceFold`](../../apps/tagger/shared.js#L392), [`cardFold`](../../apps/tagger/shared.js#L426), [`classifyCards`](../../apps/tagger/shared.js#L721) | Kết quả của set piece; thẻ vàng thứ hai được tính là thẻ đỏ |
| [`PLAYER_CATS`](../../apps/tagger/shared.js#L480), [`TEAM_SECTIONS`](../../apps/tagger/shared.js#L927), [`sumTeam`](../../apps/tagger/shared.js#L917) | Cột theo cầu thủ, section so sánh đội, tổng của đội |
| [`playedMinutes`](../../apps/tagger/shared.js#L828), [`matchWindows`](../../apps/tagger/shared.js#L815), [`onPitchAt`](../../apps/tagger/shared.js#L893) | Phút thi đấu và ai đang trên sân tại thời điểm t |
| [`shotList`](../../apps/tagger/shared.js#L646), [`goalMouthSVG`](../../apps/tagger/shared.js#L706) | Danh sách cú sút và vẽ khung thành |
| [`withSquad`](../../apps/tagger/shared.js#L789), [`squadNames`](../../apps/tagger/shared.js#L752), [`gkShirts`](../../apps/tagger/shared.js#L775), [`playerLabel`](../../apps/tagger/shared.js#L784) | Đội hình, tên cầu thủ, thủ môn |
| [`passMatrix`](../../apps/tagger/shared.js#L904) | Ma trận chuyền From→To |
| [`syncBackLink`](../../apps/tagger/shared.js#L79) | Nút "← Tagging" quay lại kèm `#match=` |

## 10. Dữ liệu

Trang Stats đọc (không ghi) `pitchtagger.rows.v1`, `meta.v1`, `lineups.v1` và `.match.v1`,
`duration.v1` và `.match.v1`, `cloud.cfg`. Từ Supabase, nó đọc `matches` và `events` (realtime).
Portal chỉ dùng payload `match_reports`. Film trong portal ghi `hna.film.tools.v1`.

## 11. Lưu ý khi sửa

- Sửa `stats-view.js`, `report.js` hay `stats-view.css` thì phải bump `?v=` ở `Stats/index.html`
  **và** trong `apps/portal/assets/app.js` (`loadStatsView`), rồi bump `app.js?v=` trong
  `app.html`.
- Chứng minh không có tab nào khác bị đổi: chạy bản cũ và bản mới song song trong `vm`, bấm qua
  mọi màn hình, so `innerHTML`, và so cả output CSV/XLSX/PDF.
- Bản đồ đếm khác với bảng thì ghi phần đối chiếu vào design doc và khoá bằng test, không ghi
  lên màn hình.
- Test: `stats-view`, `stats-general`, `stats-distribution`, `stats-setpieces`, `stats-export`,
  `stats-heatmap-half`, `stats-tabs-split`, `shooting-goal-map`, `shot-list`, `report-sections`,
  `report-visuals`, `minutes-played`, `film-*`.
