# Tagger: Tab gắn nhãn (tagging)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/tagger/`. Mở thẳng một trận bằng `…/tagger/#match=<code 5 số hoặc uuid>`. |
| File nguồn | [`apps/tagger/index.html`](../../apps/tagger/index.html): HTML, CSS và ~3900 dòng JS inline, chạy cùng [`apps/tagger/cloud-sync.js`](../../apps/tagger/cloud-sync.js) (`window.Cloud`, đồng bộ Supabase) |
| Script | `auth.js` (cổng), `xlsx 0.18.5`, `supabase-js@2`, `cloud-sync.js?v=52` |
| Người dùng | Analyst |
| Đăng nhập | Bắt buộc ([tagger-auth.md](tagger-auth.md)) |
| Design doc | [`entry-number-gate-design.md`](../design/entry-number-gate-design.md), [`user-hotkeys-macros-design.md`](../design/user-hotkeys-macros-design.md), [`submit-analysis-gate-design.md`](../design/submit-analysis-gate-design.md), [`gk-events-and-duel-split-design.md`](../design/gk-events-and-duel-split-design.md), [`red-card-moment-design.md`](../design/red-card-moment-design.md), [`minutes-played-design.md`](../design/minutes-played-design.md), [`match-save-permission-design.md`](../design/match-save-permission-design.md) |

Đây là công cụ chính của analyst. Analyst xem video trận đấu và gõ từng entry kiểu `8qq*s6`,
tức là cầu thủ số 8 thực hiện recovery rồi chuyền thành công cho số 6, sau đó click lên sân để
đặt chấm cho mỗi lần chạm bóng. Event được lưu vào localStorage và đồng bộ realtime qua
Supabase. Xong trận thì analyst bấm ⇪ Submit Analysis để "đóng băng" trận cho CLB xem.

> **Tab này có bản engine thống kê riêng** (`newStat`, `computeStats`, `EVENT_INC`,
> `EV_ALIAS`…) và **không nạp `shared.js`**. Sửa quy tắc thống kê thì phải sửa cả hai nơi.

## 1. Bố cục

| Vùng | ID | Nội dung |
| --- | --- | --- |
| Thanh trên | | Logo, **▾ Other** (`otherBtn`), ⚙ Event, 🎞 Video, 📊 Stats, ⧉ Open window, ⏱ Duration, ⚽ Match, 👥 Player lists |
| Tỉ số | `homeName`, `scoreBoard`, `awayName` | Tên đội lấy từ bảng `teams`, không sửa ở đây. Tỉ số tự đếm từ event. |
| Môn | `sportSel` | `football`, `football7`, `futsal`, `basketball` (`SPORTS`). Mỗi môn có từ điển event riêng và hình sân riêng ([`pitchFootball`](../../apps/tagger/index.html#L1890), [`courtFutsal`](../../apps/tagger/index.html#L1904), [`courtBasketball`](../../apps/tagger/index.html#L1912), chọn qua [`pitchSVG`](../../apps/tagger/index.html#L1925)). Khung thành chỉ có ở các môn bóng đá và futsal (`GOAL_SPORTS`). |
| Video | `videoWrap`, `video`, `controls` | Kéo thả file vào `#drop`, thanh tua tự làm, tốc độ (`ctlRate`), timecode (`tcode`) |
| Sân | `formationPanel`, `fmPitch`, `fmSubs` | Sân để đặt chấm, đội hình hiện tại, hàng dự bị |
| Khung thành | `goalStage`, `goalWrap` | Đặt điểm bóng qua vạch cho shot on target / goal |
| Ô nhập | `teamSeg` (`segHome`/`segAway`), `playerInput`, `fmBtn`, `halfSel` | Chọn đội, ô gõ entry, ⛨ Formation, lọc hiệp |
| Bảng event | `tbl`, `tbody`, `emptyMsg` | Các event đã tag |

Các modal: `evModal` (⚙ Event), `durModal` (⏱ Duration), `submitModal`, `cloudModal` (☁ Cloud),
`matchHub` (⚽ Match), `matchModal` (đăng ký trận mới), `videoModal`, `lineupModal`,
`fmModal` (⛨ Formation), `statsModal` (cũ, xem mục 13).

## 2. Ô nhập entry: chức năng cốt lõi

### 2.1 Cú pháp

Ví dụ trong code ([dòng 2510](../../apps/tagger/index.html#L2510)):

| Gõ | Nghĩa |
| --- | --- |
| `1s2` | Số 1 chuyền thành công cho số 2 |
| `1s2s3s4` | Chuỗi chuyền một chạm 1→2→3→4 (các chấm liên tiếp được dùng chung) |
| `1s2s1ss` | … pass cuối hỏng, cần thêm một chấm nơi đối phương lấy bóng |
| `1xx*aa` | `*` nối nhiều event cho cùng một cầu thủ (duel fail + tackle fail của số 1) |
| `1k*c2` | Số 1 đá phạt, rồi cross cho số 2. Event chuyển bóng trong nhóm `*` lấy số kế tiếp làm người nhận. |
| `38sub6*27sub43` | Hai cầu thủ được thay trong một entry |

Quy tắc:

- Mỗi số áo là **một chấm** trên sân, theo đúng thứ tự gõ.
- Pass/cross **hỏng** ở cuối entry cần thêm một chấm (`TRAILING_EXTRA_DOT`).
- Pass/cross **thành công** bắt buộc có người nhận (`NEEDS_RECEIVER`), và chấm của người nhận
  điền vào cột `rx,ry`.
- Chỉ pass, cross và substitution được lấy số tiếp theo làm người nhận (`TRANSFER_EVENTS`).

### 2.2 Luồng gửi một entry

| Bước | Function |
| --- | --- |
| Tách cú pháp thành event và số chấm cần đặt | [`parseChain`](../../apps/tagger/index.html#L2526) (với [`flush`](../../apps/tagger/index.html#L2532)) |
| Tra hotkey ra event (hỗ trợ mã nhiều ký tự như `aa`) | [`eventForKey`](../../apps/tagger/index.html#L2433), [`expandKey`](../../apps/tagger/index.html#L2445) |
| Mở macro thành dạng viết đầy đủ | [`expandMacros`](../../apps/tagger/index.html#L2463), [`macroForKey`](../../apps/tagger/index.html#L2439) |
| Kiểm tra số áo: mọi số trong entry phải là cầu thủ của đội đó **tại thời điểm đó** | [`checkEntryNumbers`](../../apps/tagger/index.html#L2880), [`numberGateMessage`](../../apps/tagger/index.html#L2936), [`selectEntryNumber`](../../apps/tagger/index.html#L2965) (đặt con trỏ đúng vào số sai) |
| Đặt chấm: click lên sân; chấm kéo được; Esc bỏ chấm vừa đặt | [`onPitchClick`](../../apps/tagger/index.html#L2101), [`renderPitch`](../../apps/tagger/index.html#L2108), [`makeDotDraggable`](../../apps/tagger/index.html#L2061), [`undoLastDot`](../../apps/tagger/index.html#L1069) |
| Shot on target / goal: đặt điểm bóng qua vạch khung thành trước khi lưu | [`openGoalCapture`](../../apps/tagger/index.html#L1483), [`renderGoalCapture`](../../apps/tagger/index.html#L1494), [`closeGoalCapture`](../../apps/tagger/index.html#L1490) |
| Ghi hàng, cập nhật bảng/tỉ số, đẩy lên cloud | [`submitEntry`](../../apps/tagger/index.html#L2605), rồi [`saveRows`](../../apps/tagger/index.html#L1078), [`renderTable`](../../apps/tagger/index.html#L3818), [`updateScore`](../../apps/tagger/index.html#L1580), `Cloud.onLocalUpsert` |

Mỗi hàng lưu: thời điểm video, đội, cầu thủ, event, toạ độ `x,y`, người nhận và `rx,ry`, điểm
khung thành `goal_x/goal_y` (chỉ với shot), nhóm `grp` (các event cùng một entry), hiệp.

### 2.3 Thay người và thẻ đỏ

- Substitution: [`planSubGroup`](../../apps/tagger/index.html#L3334) kiểm tra mọi cặp thay
  người trong entry so với đội hình đang có. Hợp lệ thì [`applySubGroup`](../../apps/tagger/index.html#L3381)
  tạo **một** snapshot đội hình mới. Xoá entry thì [`removeSubSideEffects`](../../apps/tagger/index.html#L3430)
  gỡ snapshot đó.
- Thẻ đỏ: [`applyRedCard`](../../apps/tagger/index.html#L3485). Cầu thủ rời sân và **không**
  xuống ghế dự bị. Gỡ bằng [`removeRedSideEffects`](../../apps/tagger/index.html#L3516).
- Đội hình tại thời điểm t: [`effectiveLU`](../../apps/tagger/index.html#L2828) và
  [`squadAt`](../../apps/tagger/index.html#L2857).

### 2.4 Sửa và xoá event

Bảng event **không có ô sửa trực tiếp**. Mọi thay đổi phải qua ✎ Edit để chạy lại toàn bộ
quy tắc kiểm tra.

| Thao tác | Function |
| --- | --- |
| Sửa một event: đưa cú pháp và chấm trở lại ô nhập | [`startEdit`](../../apps/tagger/index.html#L3704) |
| Sửa cả chuỗi (cùng `grp`) | [`startEditGroup`](../../apps/tagger/index.html#L3738) |
| Huỷ sửa (Esc, hoặc xoá trắng ô nhập) | [`cancelEdit`](../../apps/tagger/index.html#L3769) |
| Xoá một hàng hoặc cả chuỗi, ở local lẫn cloud | [`deleteRows`](../../apps/tagger/index.html#L3804) |
| Vẽ bảng (lọc theo `halfSel`) | [`renderTable`](../../apps/tagger/index.html#L3818), [`chainHTML`](../../apps/tagger/index.html#L3791) |

### 2.5 Phím tắt

Ô nhập có handler riêng ([dòng 2568](../../apps/tagger/index.html#L2568)). Handler toàn trang
([dòng 3948](../../apps/tagger/index.html#L3948)) xử lý các phím khi focus không nằm trong ô
nhập, rồi đưa các phím chữ và số vào ô nhập.

| Phím | Hành động |
| --- | --- |
| `Tab` | Đổi đội Home ↔ Away ([`setTeam`](../../apps/tagger/index.html#L2217)) |
| `Space` | Phát / dừng |
| `.` / `/` | Lùi / tiến 0,2 giây |
| `←` / `→` | Lùi / tiến 2 giây |
| `+` / `-` | Tốc độ ±0,1 ([`setPlaybackRate`](../../apps/tagger/index.html#L1874)) |
| `Enter` | Gửi entry |
| `Esc` | Bỏ chấm vừa đặt / thoát đặt điểm khung thành / huỷ sửa |
| `Shift` (giữ) | Hiện sân trong cửa sổ video tách rời |

## 3. Video (🎞 Video, ⧉ Open window)

| Chức năng | Function |
| --- | --- |
| Modal chọn nguồn: URL, upload R2, file local | [`openVideoModal`](../../apps/tagger/index.html#L1805) |
| File local (chỉ trình duyệt này xem được) | [`loadFile`](../../apps/tagger/index.html#L1783), kéo thả vào `#drop` |
| Dán URL `.mp4`/`.webm`; trong trận chia sẻ thì lưu vào `matches.video_url` | [`useVideoUrl`](../../apps/tagger/index.html#L1814), [`loadVideoUrl`](../../apps/tagger/index.html#L1791), `Cloud.setVideoUrl` |
| Upload lên Cloudflare R2: Worker ký link PUT, trình duyệt PUT thẳng lên R2 | `r2Pick` / `r2File`, rồi [`Cloud.uploadToR2`](../../apps/tagger/cloud-sync.js#L431) |
| Gỡ video chia sẻ | [`unloadVideo`](../../apps/tagger/index.html#L1832) |
| Thanh tua tự làm (thay cho control gốc của trình duyệt) | [`makeSeekBar`](../../apps/tagger/index.html#L1942) |
| Tách video ra cửa sổ riêng, để bảng event chiếm cả màn hình | [`openVideoWindow`](../../apps/tagger/index.html#L1984), [`returnVideo`](../../apps/tagger/index.html#L2162), [`bringHome`](../../apps/tagger/index.html#L2005) |

## 4. Event và hotkey (⚙ Event)

Modal `evModal` gồm 2 bảng.

**Event types** ([`renderEvents`](../../apps/tagger/index.html#L2290)): mỗi event một hotkey.

- Từ điển event là **của toàn site** (bảng `event_types`), nhưng **hotkey là của từng người**
  (`user_prefs`). [`setKey`](../../apps/tagger/index.html#L2245) chỉ ghi hotkey của mình;
  [`resolveKeys`](../../apps/tagger/index.html#L1677) trộn mặc định của site với hotkey của mình.
- [`nextFreeKey`](../../apps/tagger/index.html#L2342): một mã chỉ coi là trống khi không có
  event **lẫn** macro nào dùng nó.
- Thêm event hay đổi thứ tự thì [`saveEvents`](../../apps/tagger/index.html#L1685) và
  `Cloud.onEventTypesChanged` → [`pushEventTypes`](../../apps/tagger/cloud-sync.js#L185) (chỉ
  **thêm**, không bao giờ xoá). Từ điển do người khác đẩy lên được áp vào qua
  [`applyEventTypes`](../../apps/tagger/index.html#L1692).

**Macro** ([`renderMacros`](../../apps/tagger/index.html#L2363)): một mã cho cả chuỗi event.

- **＋ Add Macro** ([`addMacro`](../../apps/tagger/index.html#L2401)): gõ chuỗi theo đúng cú
  pháp entry (`qq*s`) rồi đặt mã (`qs`). Từ đó gõ `1qs2` tương đương `1qq*s2`.
- [`macroKeyProblem`](../../apps/tagger/index.html#L2350): **hotkey của event luôn thắng macro
  cùng mã**, và mã bị trùng được tô đỏ. [`setMacroKey`](../../apps/tagger/index.html#L2357) để đổi mã.
- [`retypeForMe`](../../apps/tagger/index.html#L2484) hiện entry do người khác gõ theo hotkey
  của mình.

Trên modal còn có:

- **Event đang chọn:** `activeName` và `activeKey`, cập nhật bởi [`updateBanner`](../../apps/tagger/index.html#L2234)
  và [`setActive`](../../apps/tagger/index.html#L2230).
- **Trạng thái lưu** `#storeStatus` ([`updateStoreStatus`](../../apps/tagger/index.html#L1771)):
  *☁ synced to cloud (n)* khi đã kết nối cloud, *✓ auto-saved (n)* khi chỉ lưu local, hoặc
  *⚠ can't save — use Backup* khi trình duyệt chặn localStorage.

Đồng bộ hotkey và macro theo tài khoản: [`localPrefs`](../../apps/tagger/index.html#L1755) và
[`applyUserPrefs`](../../apps/tagger/index.html#L1758), qua `Cloud.initUserPrefs`,
`pushUserPrefs` và realtime `user_prefs`.

> Thêm event mới: `DEFAULT_EVENTS` ([dòng 879](../../apps/tagger/index.html#L879)) chỉ có tác
> dụng với trình duyệt **chưa từng** mở site. Hãy dùng script console (`scripts/console/seed_gk_events.js`).
> Xem `CLAUDE.md`, mục 5.

## 5. Đội hình (👥 Player lists, ⛨ Formation)

- **👥 Player lists** mở trang [`Player-Lists/`](tagger-player-lists.md) trong tab mới, kèm
  `#match=` ([`subPageUrl`](../../apps/tagger/index.html#L1117)). Modal `lineupModal` cũ vẫn
  còn trong trang ([`renderLineup`](../../apps/tagger/index.html#L1236),
  [`addLuPlayer`](../../apps/tagger/index.html#L1293), [`toggleXI`](../../apps/tagger/index.html#L1281),
  [`luSwitchDir`](../../apps/tagger/index.html#L1326)).
- **Đội hình trên sân chính** (chỉ đọc, cả hai đội, theo thời điểm video):
  [`renderFormationMain`](../../apps/tagger/index.html#L1336),
  [`renderFormationSubs`](../../apps/tagger/index.html#L1383),
  [`refreshFormation`](../../apps/tagger/index.html#L1393).
- **⛨ Formation** (`fmModal`): xem và sửa đội hình theo thời gian của từng đội và từng hiệp.
  - [`openFmModal`](../../apps/tagger/index.html#L3551), [`renderFmModal`](../../apps/tagger/index.html#L3558).
  - Kéo chấm: [`fmDrag`](../../apps/tagger/index.html#L3659).
  - Double-click mốc thời gian để sửa: [`fmEditPeriodTime`](../../apps/tagger/index.html#L3624).
    Snapshot của substitution liên quan cũng dời theo ([`shiftSubRowsWithPeriod`](../../apps/tagger/index.html#L3456)).
  - **＋ Save formation at video time** (`fmSnapBtn`): lưu đội hình tại thời điểm video hiện tại.
  - Mở modal thì tự dàn đều các chấm trong mỗi ô vị trí cho cả timeline của đội đó
    ([`fmArrange`](../../apps/tagger/index.html#L3539), [`arrangeXI`](../../apps/tagger/index.html#L1209)).
- Đổi hướng tấn công là **xoay 180°** cả hai trục, và áp cho cả trận chứ không riêng một đội
  ([`turnXI`](../../apps/tagger/index.html#L1301), [`faceTeam`](../../apps/tagger/index.html#L1316)).

## 6. Đồng hồ trận (⏱ Duration)

Modal `durModal` ánh xạ thời gian video sang đồng hồ trận đấu. Các trường: độ dài hiệp
(`durHalfLen`), bắt đầu/kết thúc hiệp 1 và hiệp 2 (`durH1Start` … `durH2End`), và ô
**Apply to timeline** (`durEnabled`).

| Function | Chức năng |
| --- | --- |
| [`openDurModal`](../../apps/tagger/index.html#L4276), [`fillDur`](../../apps/tagger/index.html#L4248), [`applyDur`](../../apps/tagger/index.html#L4255) | Mở, điền, áp dụng |
| [`parseTime`](../../apps/tagger/index.html#L1539) | Nhận `mm:ss(.cc)`, `h:mm:ss` hoặc số giây |
| [`matchTime`](../../apps/tagger/index.html#L1588), [`videoTimeFromMatch`](../../apps/tagger/index.html#L1610) | Video sang đồng hồ trận và ngược lại |
| [`matchClockParts`](../../apps/tagger/index.html#L1604), [`fmtMatchClock`](../../apps/tagger/index.html#L1607) | Hiện bù giờ dạng `45:00 +01:05.36` |
| [`eventHalf`](../../apps/tagger/index.html#L1558) | Hàng thuộc hiệp nào, theo mốc kick-off hiệp 2 |
| [`saveDuration`](../../apps/tagger/index.html#L1025), [`applyCloudDuration`](../../apps/tagger/index.html#L4267), [`resetDuration`](../../apps/tagger/index.html#L1033) | Lưu kèm dấu trận (`durStamp`), nhận từ cloud, reset khi mở trận chưa có đồng hồ |

Đồng hồ được lưu vào `matches.config` qua `Cloud.onDurationChanged`. Mốc Duration cũng là cơ sở
tính phút thi đấu.

## 7. Trận đấu (⚽ Match, ☁ Cloud)

| Chức năng | Function |
| --- | --- |
| **⚽ Match** mở `matchHub`: 5 trận gần nhất **của tài khoản này** | [`renderRecentMatches`](../../apps/tagger/index.html#L4521), [`rememberMatch`](../../apps/tagger/index.html#L4512) (`pitchtagger.recent.v1`, khoá theo user id) |
| Gõ Match ID (5 số hoặc uuid) thì hiện thẻ xem trước gồm hai đội và tỉ số, bấm vào để mở | [`renderMatchPreview`](../../apps/tagger/index.html#L4476), [`Cloud.findMatchByCode`](../../apps/tagger/cloud-sync.js#L310) (tính tỉ số), `cloudMatchId` / `cloudJoin`, rồi [`Cloud.joinMatch`](../../apps/tagger/cloud-sync.js#L330) / [`openByInput`](../../apps/tagger/cloud-sync.js#L334) |
| **＋ New match** mở `matchModal`: chọn hoặc tạo đội nhà/khách (`nmHomeNew`/`nmAwayNew`), chọn ngày, rồi **Register** | [`openMatchModal`](../../apps/tagger/index.html#L4454), [`Cloud.createTeam`](../../apps/tagger/cloud-sync.js#L134), [`Cloud.createMatchWithTeams`](../../apps/tagger/cloud-sync.js#L287) |
| Mở trận: nạp event, đội hình, đồng hồ, video và đăng ký realtime | [`Cloud.openMatchRow`](../../apps/tagger/cloud-sync.js#L343), [`subscribe`](../../apps/tagger/cloud-sync.js#L392) (kênh `match:<id>`), [`setMatchTeams`](../../apps/tagger/index.html#L1084) |
| Khoá các nút cần trận khi chưa mở trận nào | [`updateMatchGate`](../../apps/tagger/index.html#L1103) |
| **☁ Cloud** (trong ▾ Other): nhập URL và anon key tuỳ chỉnh, rồi Connect | [`Cloud.connect`](../../apps/tagger/cloud-sync.js#L86). Không có phiên tài khoản thì đăng nhập anonymous. |

**Realtime:** ba kênh: `match:<id>` (event và match row), `event_types`
([`subscribeEventTypes`](../../apps/tagger/cloud-sync.js#L204)), `user_prefs`
([`subscribeUserPrefs`](../../apps/tagger/cloud-sync.js#L268)). Event của người khác hiện ngay (`applyRemote`).
Đội hình và đồng hồ đổi ở tab khác được đẩy lên qua [`onLineupsChanged`](../../apps/tagger/cloud-sync.js#L491)
và [`onDurationChanged`](../../apps/tagger/cloud-sync.js#L471). Event của mình đẩy lên qua
[`onLocalUpsert`](../../apps/tagger/cloud-sync.js#L522) và [`onLocalDelete`](../../apps/tagger/cloud-sync.js#L527).
Chuyển đổi giữa hàng local và hàng DB: [`rowToDb`](../../apps/tagger/cloud-sync.js#L32) và
`dbToRow`. Ghi vào match thất bại thì [`saveFailed`](../../apps/tagger/cloud-sync.js#L78) hiện
banner đỏ.

## 8. ⇪ Submit Analysis: đóng băng trận cho CLB

Nằm trong ▾ Other. Handler ở [dòng 4662](../../apps/tagger/index.html#L4662).

1. Mở `submitModal`, nạp danh sách channel (`Cloud.reportClubs`) vào `submitClub`, và trạng
   thái lần publish trước (`Cloud.reportStatus`). Nếu tagging đã thay đổi sau lần publish đó
   thì dialog nói rõ.
2. **Cổng kiểm tra** [`checkAnalysis`](../../apps/tagger/index.html#L3300) chạy 11 phép kiểm
   tra (`AN_ORDER`), hiện bằng [`renderAnalysisChecks`](../../apps/tagger/index.html#L4630):
   - Tổng và tính đối xứng của duel trên không, duel mặt đất, duel tay đôi, duel bóng lỏng
     (duel thắng của bên này phải bằng duel thua của bên kia): [`totalCheck`](../../apps/tagger/index.html#L3101),
     [`mirrorCheck`](../../apps/tagger/index.html#L3111), gợi ý vị trí sai qua [`duelHints`](../../apps/tagger/index.html#L3264).
   - Đối xứng take-on.
   - **Shot on target phải có điểm khung thành** ([`checkShotSpots`](../../apps/tagger/index.html#L3128)).
   - **Mọi số áo phải có trong đội hình tại thời điểm đó** ([`checkShirtNumbers`](../../apps/tagger/index.html#L3196)).
   - Mỗi lỗi in kèm thời điểm (`H2 67:40`), tối đa 12 dòng (`AN_SPOT_MAX`).
3. Dialog **không** sẵn sàng khi DB còn ít event hơn tab đang tag (đồng bộ chưa xong).
4. **Publish this match** (`submitGo`) gọi [`Cloud.publishReport`](../../apps/tagger/cloud-sync.js#L611):
   [`fetchAllEvents`](../../apps/tagger/cloud-sync.js#L543) rồi [`buildReport`](../../apps/tagger/cloud-sync.js#L557)
   (event, đội hình kèm lịch sử thay người, ánh xạ hiệp↔video), chạy lại cổng kiểm tra trên
   chính bản build đó, rồi gọi `rpc publish_match_report`. Mỗi lần publish **tạo thêm một
   version**, không ghi đè bản cũ.
5. Từ chối thì [`analysisRefusal`](../../apps/tagger/index.html#L3315) tóm tắt một dòng các
   phép kiểm tra bị trượt.

## 9. Tỉ số và các trang con

- Tỉ số: [`computeScore`](../../apps/tagger/index.html#L1569) cộng bàn của đội và phản lưới
  của đối phương. Hàm này giống hệt `teamGoals()` trong `stats-view.js`.
- **📊 Stats** mở `Stats/#match=…` trong cửa sổ `pt-stats` (xem [tagger-stats.md](tagger-stats.md)).
  Mọi export XLSX/CSV/PDF đều nằm trên trang Stats.

## 10. ▾ Other (menu tài khoản)

Hiện tên và ảnh tài khoản (`otherWho`), **☁ Cloud**, **⇪ Submit Analysis**, **⎋ Sign out**
(`PTAuth.signOut()`, đăng xuất mọi tab). Code bắt đầu ở [dòng 4560](../../apps/tagger/index.html#L4560).

## 11. Dữ liệu

| localStorage | Nội dung |
| --- | --- |
| `pitchtagger.rows.v1` | Các hàng event |
| `pitchtagger.meta.v1` | Tên đội, id trận và code của trận đang mở |
| `pitchtagger.events.v1` | Từ điển event theo môn |
| `pitchtagger.hotkeys.v1` | Hotkey theo user và theo môn |
| `pitchtagger.macros.v2` | Macro theo user (`v1` là bản cũ, chỉ đọc khi nâng cấp) |
| `pitchtagger.prefs.at.v1` | Thời điểm sửa prefs, dùng để quyết định local hay cloud mới hơn |
| `pitchtagger.lineups.v1` + `.match.v1` | Đội hình, kèm dấu trận |
| `pitchtagger.duration.v1` + `.match.v1` | Đồng hồ trận, kèm dấu trận |
| `pitchtagger.recent.v1` | Các trận gần đây theo user |
| `pitchtagger.cloud.cfg` | URL và key Supabase tuỳ chỉnh |

| Supabase | Đọc/Ghi |
| --- | --- |
| `matches` | Tạo, mở, `video_url`, `config` (duration), `lineups`, tên đội |
| `events` | Đọc/ghi realtime từng hàng |
| `teams` | Đọc, tạo |
| `event_types` | Đọc, thêm, sắp xếp lại (realtime) |
| `user_prefs` | Hotkey và macro (realtime) |
| `clubs` | Danh sách channel cho Submit |
| `rpc publish_match_report` | Ghi `match_reports` và đánh dấu trận đã publish |
| Worker `/` | Ký link upload R2 |

## 12. Lưu ý khi sửa

- Sửa `cloud-sync.js` thì phải bump `cloud-sync.js?v=` trong `index.html`.
- Test lấy function ra **theo tên** (`tests/harness.js`). Đổi tên hàm thì test báo "not found".
- Code ghi trận phải chịu được DB chưa chạy migration mới: ví dụ event không có điểm khung
  thành thì không gửi cột `goal_x/goal_y`.
- File lớn nhất repo, kiểm tra kỹ: `tests/substitution`, `entry-numbers`, `receiver-dots`,
  `goal-spot`, `macro-hotkeys`, `macro-rekey`, `user-prefs`, `analysis-gate`, `red-card`,
  `card-timeline`, `match-save`, `match-cloud-split`, `recent-matches`, `video-window`,
  `duration-goto`, `period-time-edit`, `events-table`, `entry-autocomplete`, `quiet-tagging`.

## 13. Thành phần cũ còn trong trang

- `statsModal` và [`openStatsModal`](../../apps/tagger/index.html#L4245): bảng thống kê trong
  modal kiểu cũ. Không còn nút nào mở nó vì 📊 Stats giờ mở trang `Stats/`, nhưng code vẫn còn
  ([`renderStats`](../../apps/tagger/index.html#L4188), [`renderGeneral`](../../apps/tagger/index.html#L4380)).
- `buildSheets`, `statsSheet`, `passSheet`, `eventsSheet`, `teamStatsSheet`
  ([dòng 3929](../../apps/tagger/index.html#L3929)): export đã chuyển sang trang Stats. Comment ở
  [dòng 3936](../../apps/tagger/index.html#L3936) nói *"used by the cloud module"*, nhưng
  `cloud-sync.js` và các file khác **không gọi** hàm nào trong số này (grep ngày 2026-11-05).
  Có thể đây là code chết, cần kiểm tra trước khi xoá.
