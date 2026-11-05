# UAT — Detailed Design: một môi trường thứ hai, chạy song song production

**Hôm nay không có gì đứng giữa `git push` và khách hàng. Một lần push lên `main` là
[`deploy.yml`](../../.github/workflows/deploy.yml) dựng `_site` rồi publish thẳng lên GitHub Pages, và
lần đầu tiên một tính năng mới gặp Supabase thật, R2 thật, email thật và cache của trình duyệt
thật — là trên chính trang khách đang mở. 1270 test trong `tests/` chạy trong `vm` với stub cho
DOM/video/cloud: chúng chứng minh logic, và **theo thiết kế** chúng không thể chạm tới RLS, CORS,
cache HTTP, link xác nhận email, hay đường dẫn thật sau khi Pages di dời thư mục. Tài liệu này
thiết kế môi trường UAT đứng song song production: cùng một commit, khác origin, khác database,
khác bucket, khác Worker — để một tính năng mới được ký duyệt ở đó trước khi chạm vào khách.**

Trạng thái: **thiết kế — chưa triển khai** (2026-08-27). Sáu câu hỏi cần chốt ở §14; §13 là kế
hoạch thi công, chỉ chạy sau khi chốt. Không có dòng code nào được viết cho tài liệu này.

Phạm vi dự kiến khi thi công (§15 liệt kê đầy đủ):
`scripts/assemble.sh` (mới), `env/prod.env` + `env/uat.env` (mới),
`.github/workflows/deploy.yml` (rút gọn), `.github/workflows/deploy-uat.yml` (mới),
`worker/wrangler.toml` (+1 khối `[env.uat]`), `worker/r2-cors.uat.json` (mới),
`supabase/seed/uat_demo.sql` (mới), 8 file test đổi **một hằng số đường dẫn**.
**`index.html` / `shared.js` / `cloud-sync.js` / `auth.js` / `Stats/*` / `Player-Lists/*` /
`client/assets/*` = 0 dòng logic thay đổi.** Không đụng `?v=` của file nào.

Ba con số cần biết trước khi đọc tiếp, đo trên repo lúc viết:

| Đo cái gì | Kết quả |
|---|---|
| File đang giữ cứng endpoint production | **5** file, phục vụ thành **6** bản trên site live (`auth.js` được `cp` hai lần) |
| File test đọc `.github/workflows/deploy.yml` và khẳng định có dòng `cp` | **8** |
| Dung lượng miễn phí R2 dùng chung giữa hai môi trường | **10 GB**, không tách theo bucket |
| `node tests/run.js`, chạy lúc viết tài liệu này (2026-08-27) | **1270/1270 passed** |

---

## 1. Vấn đề

### 1.1 Đường đi hiện tại của một thay đổi

```
sửa code → node tests/run.js → git push main → deploy.yml → GitHub Pages → khách hàng
                  ▲                                                            ▲
            chỗ duy nhất kiểm tra                              chỗ đầu tiên chạy thật
```

Giữa hai mũi tên đó không có gì. `deploy.yml` không chạy test — nó `checkout`, `cp`, `upload`,
`deploy`. Test là việc của người push, chạy trên máy mình, trước đó. Một commit bỏ qua test vẫn
lên production xanh mượt.

### 1.2 Cái mà 1270 test không thể chạm tới

Bộ test lấy hàm ra khỏi `<script>` của `index.html` rồi chạy trong `vm` sandbox với stub cho
DOM/video/cloud. Đó là điểm mạnh của nó (không cài gì, chạy trong một giây, luôn test đúng code
được ship) và cũng chính là ranh giới của nó. Những lớp lỗi sau **không thể** xuất hiện trong
sandbox, vì ở đó không có thứ gây ra chúng:

| Lớp lỗi | Vì sao sandbox không thấy | Đã từng xảy ra thật |
|---|---|---|
| Chính sách RLS sai/thiếu | Không có Postgres, không có JWT, `select` là stub | — |
| CORS của R2 | Không có mạng, không có preflight | `film-export-cors-design.md` |
| Cache HTTP nói dối | Không có cache, không có `crossorigin` | ✅ commit `46bfb56` |
| Link xác nhận email đi sai chỗ | Không có Supabase Auth, không có hộp thư | ✅ ghi trong `README §Supabase setup` |
| File quên `cp` → 404 khi live | Sandbox đọc file từ đĩa repo, không đọc `_site` | ✅ chính là lý do có test manifest |
| `?v=` không tăng → khách chạy JS cũ | Sandbox không có trình duyệt, không có cache | ✅ "đã xảy ra hai lần", `asset-versions.test.js` |
| Origin đổi, endpoint không đổi theo | Sandbox không có origin | ✅ commit `78e2b55` |
| Worker `/contact` + Resend + rate-limit KV | Không gọi mạng | — |

Bốn dòng có dấu ✅ là bốn lần lớp lỗi đó **đã** ra tới production và phải sửa bằng một commit
riêng. Đó không phải lập luận rằng test kém — nó là lập luận rằng cần một chỗ thứ hai để lỗi
loại này rơi vào, và chỗ đó không được là trang của khách.

### 1.3 Cái UAT phải giải quyết, nói cho gọn

Một người không phải tác giả — analyst, hoặc một club thử nghiệm — phải mở được một địa chỉ
thật, đăng nhập bằng tài khoản thật, upload một video thật, tag một trận, xuất một clip, nhận
một email thật, **mà không có bất kỳ byte nào của việc đó chạm vào dữ liệu production**.

---

## 2. Ranh giới

**Làm:**
- một origin thứ hai phục vụ đúng commit đang cần duyệt
- một Supabase project thứ hai: schema giống hệt, dữ liệu là giả
- một Worker + một bucket R2 thứ hai, CORS khoá theo origin UAT
- một cơ chế cấu hình khiến bản UAT **không thể** vô tình trỏ về production, và bản production
  không thể vô tình trỏ về UAT — chặn ở khâu dựng, không phải bằng trí nhớ
- một luồng phát hành: cái gì đã duyệt ở UAT mới được lên production, và chốt bằng một lệnh `git`
  chứ không bằng lời hứa
- quy trình UAT: tiêu chí vào/ra, ai làm, test case cho các tính năng mới nhất

**Không làm:**
- không dựng môi trường thứ ba (dev/staging/pre-prod). Hai là đủ và hai là cái nuôi nổi.
- không sao chép dữ liệu production sang UAT. §6.4 giải thích vì sao đây là ranh giới cứng.
- không đổi kiến trúc ứng dụng, không thêm build step cho code (site vẫn "no build step"; cái
  thêm vào chỉ nằm trong khâu dựng gói deploy)
- không tự động hoá kiểm thử end-to-end trong lần này. UAT ở đây là **người thật bấm tay**;
  tự động hoá là việc sau, và §10.5 để chỗ cho nó.
- không đổi `?v=` của bất kỳ asset nào — tài liệu này không sửa file asset nào.

---

## 3. Hệ thống hôm nay — cái gì phải nhân đôi

### 3.1 Bản đồ production

```
                    khách / analyst
                          │
              https://hoangnams.com            (GitHub Pages, repo Football-Data-Labeling-Website)
                          │
        ┌─────────────────┼──────────────────────────────┐
        │                 │                              │
   /  index.html     /app.html  /login.html         /tagger/…  (index, Stats, Player-Lists)
   /assets/*.js      supa.js                        cloud-sync.js, auth.js, shared.js
        │                 │                              │
        │                 └──────────────┬───────────────┘
        │                                │
        │                     Supabase  xtzmtdcohoixoxqusyyz
        │                     ├── Postgres + RLS (migrations 0001…0020)
        │                     ├── Auth (email/password, confirm on, anon on)
        │                     └── Realtime
        │
        └── POST /contact ──► Worker "r2-presign"  ─┬─► R2 bucket football-videos
             POST /       ──►  (index.js router)    │    public: pub-9cdd…r2.dev
                                                    ├─► Supabase (service_role) → public.leads
                                                    └─► Resend → dnam2501@gmail.com
```

### 3.2 Bảng: từng lớp, và nhân đôi được không

| Lớp | Production hôm nay | Cấu hình nằm ở đâu | Nhân đôi kiểu gì |
|---|---|---|---|
| Hosting | GitHub Pages, 1 site/repo | Settings → Pages | **Không thể** thêm site thứ hai trên cùng repo → §4 |
| Domain | `hoangnams.com`, Enforce HTTPS | DNS + Pages settings | subdomain `uat.` |
| Frontend config | 4 chuỗi, giữ cứng trong 5 file | mã nguồn | ghi đè lúc assemble → §5 |
| Database + Auth | Supabase `xtzmtd…` | `supabase/migrations/` + dashboard | project thứ hai → §6 |
| Upload/presign | Worker `r2-presign` | `worker/wrangler.toml` + secrets | `[env.uat]` → §7.1 |
| Video storage | R2 `football-videos` | wrangler vars + CORS policy | bucket thứ hai → §7.2 |
| Email | Resend, shared sender | worker secrets | dùng chung, tách bằng nhãn → §7.4 |
| CI | `deploy.yml` on push main | workflow | workflow thứ hai → §8 |

Bốn dòng đầu là nơi mọi quyết định nằm. Bốn dòng cuối gần như chỉ là công việc tay chân.

---

## 4. Quyết định 1 — UAT đứng ở origin nào

Đây là quyết định đắt nhất, vì mọi thứ khác treo vào nó.

### 4.1 Vì sao KHÔNG dùng cùng một origin

Cách rẻ nhất nghĩ ra được là: giữ nguyên một site Pages, dựng thêm nhánh `uat` vào thư mục
`_site/uat/`, ra `https://hoangnams.com/uat/`. Một artifact, một workflow, không tốn đồng nào,
không cần DNS. Ba lý do khiến nó sai, và cả ba đều đo được chứ không phải cảm tính.

**(a) `localStorage` chia theo origin, không chia theo đường dẫn.** Ứng dụng lưu gần như toàn bộ
trạng thái làm việc ở đó:

```
pitchtagger.rows.v1      pitchtagger.events.v1     pitchtagger.lineups.v1
pitchtagger.meta.v1      pitchtagger.macros.v2     pitchtagger.hotkeys.v1
pitchtagger.recent.v1    pitchtagger.duration.v1   pitchtagger.prefs.at.v1
pitchtagger.cloud.cfg    hna.film.tools.v1         hna.rail
hna-client-auth          ← storageKey của Supabase client trên site khách
```

`hoangnams.com/uat/` và `hoangnams.com/` là **cùng một origin**. Một người tag thử trận demo ở
UAT rồi mở lại trang production sẽ thấy trận demo trong `pitchtagger.recent.v1` của mình; một
phiên đăng nhập UAT ghi đè `hna-client-auth` của phiên production và ngược lại; và
`pitchtagger.cloud.cfg` — nơi `cloud-sync.js` nhớ URL + key Supabase người dùng tự nhập — sẽ
mang cấu hình của môi trường này sang môi trường kia. Không có tiền tố nào cứu được chuyện này
mà không phải sửa mọi hằng số key trong `index.html`, tức là sửa đúng cái code đang cần test.

**(b) `?v=` trùng nhau trên cùng cache key.** Site không có build step; thứ duy nhất bảo trình
duyệt tải lại một asset là con số trong `?v=`. Ở UAT, một file thay đổi vài lần một ngày mà số
`?v=` chưa bump (đúng bản chất của bản chưa duyệt). Cùng origin nghĩa là
`/assets/app.js?v=42` ở UAT và ở production là **một entry cache**. Người test sẽ nhận bản của
môi trường kia, không có lỗi nào hiện ra, và bug báo về sẽ là bug không tồn tại. Đây chính xác
là lớp lỗi `46bfb56` đã tốn một ngày để tìm ra: *cache là kẻ nói dối*.

**(c) Một artifact, một concurrency group.** `deploy.yml` khai báo `concurrency: group: pages,
cancel-in-progress: true`. Gộp UAT vào cùng site nghĩa là mỗi lần deploy UAT là một lần
**deploy lại toàn bộ production**, và một bước dựng UAT hỏng sẽ làm đỏ chính workflow đang giữ
production. Đổi lấy một chút tiện lợi bằng việc buộc production vào rủi ro của bản chưa duyệt —
sai chiều.

**Kết luận: UAT phải ở một origin riêng.** Mọi lựa chọn dưới đây đều thoả điều đó.

### 4.2 Ba lựa chọn origin

| | **A. Repo thứ hai + GitHub Pages** | **B. Cloudflare Pages (đề xuất)** | **C. Cloudflare Worker phục vụ tĩnh** |
|---|---|---|---|
| Địa chỉ | `…github.io/…-uat/` | `uat.hoangnams.com` | `uat.hoangnams.com` |
| Đưa code lên | push mirror sang repo 2 | `wrangler pages deploy _site` từ Actions | `wrangler deploy` + assets binding |
| Giống production đến đâu | **rất giống** (cùng nền tảng, cùng kiểu đường dẫn) | gần giống; khác nhà cung cấp header/cache | khác nhiều nhất |
| Chặn người lạ | không có cách nào | **Cloudflare Access** (email OTP, free ≤50 user) | tự viết |
| Chặn Google index | chỉ `robots.txt` + meta | `_headers: X-Robots-Tag` | tự viết |
| Rollback | revert commit, chờ build | **một cú bấm**, giữ lịch sử deployment | redeploy |
| Chi phí | 0 | 0 | 0 |
| Phiền phức | quản hai repo, quyền, secret, drift lịch sử | thêm 1 secret `CLOUDFLARE_API_TOKEN` | phải tự làm lại phần tĩnh |
| Đường dẫn "đẹp" `/auth` | y hệt production | Pages tự phục vụ `auth.html`, **phải đo lại** | tự viết |

**Đề xuất: B.** Ba lý do, theo thứ tự sức nặng:

1. **Chặn được người lạ.** UAT sẽ chứa tính năng nửa vời và dữ liệu giả mang tên club thật.
   GitHub Pages không có xác thực dưới bất kỳ hình thức nào — một URL đoán được là một URL công
   khai. Cloudflare Access đặt một cổng email-OTP trước toàn bộ site mà không cần sửa một dòng
   code nào của site.
2. **Cloudflare đã ở trong hệ thống.** Worker và R2 đã chạy ở đó, `wrangler` đã có trong
   `worker/package.json`, tài khoản đã có. Không thêm nhà cung cấp mới.
3. **Rollback là hành động, không phải commit.** Khi UAT hỏng lúc đang có người test, cách sửa
   đúng là quay lại bản trước trong 5 giây, không phải mở PR revert.

Cái phải trả cho B, nói thẳng: **UAT và production chạy trên hai nền tảng hosting khác nhau.**
Header, quy tắc trailing-slash, và cách xử lý `/auth` → `auth.html` do hai bên tự quyết định.
Đó là một khoảng chênh có thật, và §11.2 liệt kê đúng những gì nó có thể giấu, cùng phép đo phải
chạy ngay ở bước nghiệm thu đầu tiên (§13, Bước 2) để biết nó chênh chỗ nào.

Nếu chấp nhận đánh đổi ngược lại — giống production tuyệt đối, và chịu việc UAT công khai — thì
A đúng hơn B. Đó là **Q1** ở §14.

### 4.3 Bản đồ sau khi có UAT

```
   PRODUCTION                                    UAT
   ───────────                                   ───
   hoangnams.com          (GitHub Pages)         uat.hoangnams.com     (Cloudflare Pages)
        │                                             │  ← Cloudflare Access chặn ở đây
        │                                             │
   Supabase xtzmtd…                              Supabase <uat-ref>
   ├ Postgres + RLS  ◄── cùng migrations ──────► ├ Postgres + RLS
   ├ Auth (khách thật)                           ├ Auth (tài khoản test)
   └ leads (người thật)                          └ leads (rác test)
        │                                             │
   Worker r2-presign                             Worker r2-presign-uat
   ├ ALLOW_ORIGIN hoangnams.com                  ├ ALLOW_ORIGIN uat.hoangnams.com
   └ R2 football-videos                          └ R2 football-videos-uat  (lifecycle 7 ngày)
        │                                             │
   Resend ──────────────── dùng chung ───────────────┘  (tách bằng nhãn, §7.4)

   Cái KHÔNG được chia sẻ: origin · database · bucket · Worker · localStorage
   Cái ĐƯỢC chia sẻ:       repo · bộ test · Resend · tài khoản Cloudflare · kiến thức
```
---

## 5. Quyết định 2 — cấu hình: bốn chuỗi, năm file, sáu bản trên site

Đây là phần dễ làm sai nhất, và là phần duy nhất trong tài liệu này có thể **âm thầm** làm hỏng
dữ liệu production. Nên nó được xử bằng một cái chặn tự động chứ không bằng một danh sách.

### 5.1 Bốn chuỗi đó nằm ở đâu — đo trên repo, không phải nhớ

```
$ grep -rln "xtzmtdcohoixoxqusyyz.supabase.co" <mọi file được deploy>
auth.js
cloud-sync.js
Stats/stats-view.js
Player-Lists/index.html
client/assets/supa.js
```

Đầy đủ cả bốn chuỗi:

| Chuỗi | File giữ nó | Vị trí |
|---|---|---|
| `https://xtzmtdcohoixoxqusyyz.supabase.co` | 5 file | `auth.js:28`, `cloud-sync.js:13`, `Stats/stats-view.js:2097`, `Player-Lists/index.html:281`, `client/assets/supa.js:16` |
| `sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa` | cùng 5 file đó | dòng ngay kế bên |
| `https://r2-presign.hoangnam25012004.workers.dev` | 2 file | `cloud-sync.js:18`, `client/index.html:783` (`CONTACT_ENDPOINT`) |
| `https://pub-9cdd291bf181425b9738328ada297691.r2.dev` | 2 file | `cloud-sync.js:18`, `client/assets/guide.js:33` (video hướng dẫn) |

**Và `auth.js` được `cp` hai lần** — `_site/tagger/auth.js` cùng `_site/auth.js`, bản thứ hai giữ
cho link trong email xác nhận cũ không 404. Nên trên site đang chạy có **6** bản mang cặp
Supabase, không phải 5.

Ba trong số này nằm ngoài chỗ mà người ta nghĩ tới đầu tiên: `Stats/stats-view.js`,
`Player-Lists/index.html` và `client/assets/guide.js` đều mang cấu hình riêng, tách khỏi
`cloud-sync.js`. Một kế hoạch UAT chỉ sửa "ba file config" sẽ cho ra một bản UAT mà **trang
Stats và trang Player Data ghi thẳng vào database production**, trong khi mọi trang khác trông
hoàn toàn đúng. Không có thông báo lỗi nào cho tình huống đó.

### 5.2 Nguyên tắc: không sửa file trong repo

Cấu hình được ghi đè **lúc dựng gói**, trên bản sao trong `_site`, không bao giờ trên file gốc.
Ba hệ quả, cả ba đều cần thiết:

1. `node tests/run.js` vẫn đọc source thật và vẫn xanh — bộ test đọc file gốc qua `readSrc()`.
2. `tests/asset-versions.json` băm file gốc, nên hash không đổi và **không phải bump `?v=` nào**.
3. Mở `index.html` từ đĩa vẫn chạy đúng như trước, y hệt lời hứa trong README.

Và một hệ quả nữa, đắt hơn cả ba: với `env/prod.env` điền đúng giá trị đang có trong code, phép
ghi đè cho production là **phép đồng nhất**. `_site` sau khi refactor phải **giống từng byte** so
với `_site` do workflow hiện tại dựng ra. Đó là điều kiện nghiệm thu của Bước 1 ở §13, và nó
biến một refactor đáng sợ thành một refactor chứng minh được.

### 5.3 `scripts/assemble.sh` — một danh sách `cp`, hai môi trường

Danh sách `cp` chuyển từ `deploy.yml` sang một script, **nguyên văn**, và cả hai workflow gọi
cùng script đó. Lý do không phải là gọn: hai danh sách `cp` song song sẽ lệch nhau, và lệch theo
đúng kiểu comment trong `deploy.yml` đã cảnh báo — *"Adding a file? Add a cp line here too, or it
404s on the live site even though the build goes green."* Một file mới thêm cho tính năng mới sẽ
được thêm vào danh sách production (vì production là nơi người ta nhìn) và quên ở danh sách UAT,
tức là **UAT 404 đúng cái tính năng đang cần duyệt**.

```bash
#!/usr/bin/env bash
# scripts/assemble.sh  prod|uat   → dựng _site cho môi trường đó
#
# Danh sách cp dưới đây là danh sách DUY NHẤT. deploy.yml và deploy-uat.yml
# đều gọi file này; không nơi nào khác được phép có một dòng cp của site.
set -euo pipefail
ENV="${1:?usage: assemble.sh prod|uat}"
[ -f "env/$ENV.env" ] || { echo "no env/$ENV.env"; exit 1; }
OUT=_site
rm -rf "$OUT"; mkdir -p "$OUT"

# ---------- client site (the root) ----------  (nguyên văn từ deploy.yml)
cp client/index.html  "$OUT/index.html"
cp client/app.html    "$OUT/app.html"
…                                     # toàn bộ khối cp giữ y như cũ
cp auth.html "$OUT/auth.html"
cp auth.js   "$OUT/auth.js"

# ---------- cấu hình môi trường ----------
# shellcheck disable=SC1090
. "env/$ENV.env"       # SUPABASE_URL SUPABASE_ANON WORKER_URL R2_PUBLIC_BASE
find "$OUT" -type f \( -name '*.js' -o -name '*.html' \) -print0 |
while IFS= read -r -d '' f; do
  sed -i \
    -e "s|https://xtzmtdcohoixoxqusyyz.supabase.co|$SUPABASE_URL|g" \
    -e "s|sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa|$SUPABASE_ANON|g" \
    -e "s|https://r2-presign.hoangnam25012004.workers.dev|$WORKER_URL|g" \
    -e "s|https://pub-9cdd291bf181425b9738328ada297691.r2.dev|$R2_PUBLIC_BASE|g" \
    "$f"
done

bash scripts/check-endpoints.sh "$ENV" "$OUT"     # §5.4 — không qua thì không deploy
```

`sed` quét **toàn bộ** `.js` và `.html` trong `_site`, không quét một danh sách file. Đó là chủ ý:
danh sách file cấu hình là thứ sẽ lệch (nó vừa lệch ở §5.1 với ba file người ta hay quên); còn
"mọi file được ship" thì không thể lệch, vì chính `_site` định nghĩa nó.

### 5.4 Cái chặn: `scripts/check-endpoints.sh`

Ghi đè có thể sót. Kiểm tra thì không được phép sót, nên nó không dựa vào danh sách nào cả — nó
đọc **kết quả**:

```bash
#!/usr/bin/env bash
# check-endpoints.sh  prod|uat  <thư mục>
# Bản UAT không được mang endpoint production, và ngược lại.
set -euo pipefail
ENV="$1"; OUT="$2"
PROD='xtzmtdcohoixoxqusyyz|sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa|r2-presign\.hoangnam25012004\.workers\.dev|pub-9cdd291bf181425b9738328ada297691'
UAT='<uat-project-ref>|r2-presign-uat|<pub-uat>'
BAD=$( [ "$ENV" = prod ] && echo "$UAT" || echo "$PROD" )
if grep -rlE "$BAD" "$OUT"; then
  echo "❌ bản $ENV còn mang endpoint của môi trường kia (các file ở trên) — dừng deploy"
  exit 1
fi
echo "✅ $ENV: không còn endpoint lạ trong $OUT"
```

Hai chiều, không phải một. Chiều `uat → không được chạm production` chặn mất mát dữ liệu. Chiều
`prod → không được chạm UAT` chặn một tai nạn khác, im lặng hơn: một bản production trỏ vào
database UAT thì khách đăng nhập được, thấy trang trống, và không ai biết vì sao.

**Cái chặn này quan trọng hơn phép ghi đè.** Nếu `sed` sót một chuỗi, `check-endpoints.sh` làm đỏ
build với đúng tên file phải sửa. Nếu nó chạy đúng, không ai cần nhớ danh sách năm file nữa.

### 5.5 `env/uat.env` — và cái không được nằm trong đó

```bash
# env/uat.env — CHỈ giá trị công khai. Không secret, không service_role key.
SUPABASE_URL="https://<uat-ref>.supabase.co"
SUPABASE_ANON="sb_publishable_<uat>"          # anon key: công khai theo thiết kế, RLS mới là hàng rào
WORKER_URL="https://r2-presign-uat.hoangnam25012004.workers.dev"
R2_PUBLIC_BASE="https://pub-<uat>.r2.dev"
```

Bốn dòng, commit được, đọc được, không có gì bí mật — đúng như comment trong `cloud-sync.js` đã
nói về anon key. `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `R2_SECRET_ACCESS_KEY` **không** ở
đây và không bao giờ ở frontend: chúng là secret của Worker (§7.1).

### 5.6 Giá phải trả: 8 file test

`.github/workflows/deploy.yml` đang được **8** file test đọc và khẳng định là có dòng `cp` tương
ứng:

```
tests/asset-versions.test.js   tests/auth-gate.test.js       tests/client-channels.test.js
tests/contact-form.test.js     tests/data-page.test.js       tests/film-tools.test.js
tests/stats-view.test.js       tests/submit-analysis.test.js
```

Chuyển danh sách `cp` sang `scripts/assemble.sh` làm **cả 8 file đỏ ngay lập tức**, và đó là tin
tốt — không có kịch bản nào mà chúng im lặng ngừng kiểm tra. Sửa là đổi đúng một hằng số đường
dẫn trong mỗi file:

```js
const YML = readSrc('.github/workflows/deploy.yml');   // trước
const YML = readSrc('scripts/assemble.sh');            // sau
```

Tên biến `YML` để nguyên hay đổi thành `SH` là chuyện thẩm mỹ; điều bắt buộc là cả 8 file trỏ về
**một** nguồn, cùng nguồn mà hai workflow thật sự chạy. Đây là **Q2** ở §14 — phương án thay thế
là để `deploy.yml` giữ danh sách và UAT tự chép lại, tức là chấp nhận drift; tài liệu này không
đề xuất nó.

---

## 6. Quyết định 3 — dữ liệu: một Supabase project thứ hai

### 6.1 Vì sao không dùng chung project với schema riêng

Có thể nghĩ tới việc dùng chung một project và tách bằng schema hoặc bằng cột `env`. Không nên,
vì ba thứ trong Supabase **không** tách theo schema: `auth.users` là một bảng cho cả project
(một email test sẽ chiếm chỗ của một email thật), Authentication → URL Configuration là **một**
cấu hình cho cả project (Site URL không thể vừa là production vừa là UAT), và một migration
chạy thử ở UAT sẽ chạy trên đúng cái Postgres đang phục vụ khách. Cả ba đều là lý do đủ.

**Project thứ hai, dứt khoát.** Đặt tên gồm chữ `uat` để không ai nhìn nhầm dashboard.

### 6.2 Schema: migrations là nguồn sự thật

20 file trong `supabase/migrations/` đã là một lịch sử schema đầy đủ và có thứ tự. Chúng chưa bao
giờ được chạy như một chuỗi từ đầu trên một project trắng — production lớn lên cùng chúng, từng
file một. Dựng UAT là **lần đầu tiên** chuỗi đó được chạy lại từ số 0, và điều đó tự nó đã có
giá trị: nếu `0001…0020` không dựng lại được production, thì repo không mô tả đúng production
nữa, và đó là một phát hiện đáng có.

```bash
supabase link --project-ref <uat-ref>
supabase db push          # chạy 0001 → 0020 theo thứ tự
```

Từ đây trở đi, **mọi migration mới đi qua UAT trước.** Đây là lợi ích lớn thứ hai của cả tài liệu
này, sau việc không làm hỏng dữ liệu khách: một `alter table` sai ở production là chuyện không
có nút undo.

Lưu ý số thứ tự: dãy hiện tại nhảy từ `0004` sang `0006` (không có `0005`). Không sao với
`db push` — nó đi theo thứ tự tên file, không theo số liên tục — nhưng đừng "sửa" bằng cách đánh
số lại, vì production đã ghi nhận đúng những tên đó.

### 6.3 Cái migration KHÔNG mang theo — bảng đối chiếu bắt buộc

Đây là danh sách hay bị quên nhất khi nhân bản một project Supabase. Cả sáu mục dưới đây chỉ có
trên dashboard; `db push` không chạm tới mục nào:

| Cấu hình | Production | UAT phải đặt là | Hỏng thì triệu chứng gì |
|---|---|---|---|
| Auth → Site URL | `…/tagger/` trên hoangnams.com | `https://uat.hoangnams.com/tagger/` | link xác nhận rơi về production, hoặc về `localhost:3000` |
| Auth → Redirect URLs | wildcard theo domain production | `https://uat.hoangnams.com/**` | `emailRedirectTo` bị bỏ qua **im lặng**, rơi về Site URL |
| Auth → Confirm email | **on** | **on** (giữ giống, để đúng cái đang test) | nếu tắt, UAT không kiểm được luồng khách thật đi |
| Auth → Anonymous sign-ins | **on** | **on** | `cloud-sync.js` không connect được, báo lỗi sai nguyên nhân |
| Auth → Sessions | mặc định, không timeout | mặc định | phiên tự hết hạn giữa buổi test → bug ma |
| SMTP | mailer mặc định | mặc định | rate limit vài mail/giờ; đủ cho UAT, xem §11.3 |

`README §Supabase setup for accounts` đã ghi lại đúng cái bẫy này bằng ngôn ngữ rất rõ: Supabase
**chỉ** tôn trọng `emailRedirectTo` nếu nó khớp Redirect URLs, ngược lại **im lặng** rơi về Site
URL. Ở UAT nó nguy hiểm hơn ở production, vì rơi về Site URL sai nghĩa là token xác nhận của
người test bay sang… tuỳ giá trị nào còn sót trong ô đó. Đặt hai ô này **trước** khi tạo tài
khoản test đầu tiên.

### 6.4 Dữ liệu: giả, và tại sao đó là ranh giới cứng

**Không sao chép dữ liệu production sang UAT.** Không phải vì sạch sẽ, mà vì hai bảng cụ thể:

- `auth.users` — email thật của khách. Đưa sang UAT là nhân bản dữ liệu cá nhân sang một hệ
  thống có tiêu chuẩn truy cập thấp hơn hẳn (nhiều người test hơn, mật khẩu dễ hơn, có khi dùng
  chung tài khoản).
- `public.leads` (`0019_leads.sql`) — người thật vừa điền form liên hệ: tên, email, club, tin
  nhắn. Cũng vậy, và tệ hơn: họ gửi cho một địa chỉ, không cho hai.

Cái UAT cần không phải dữ liệu thật mà là **hình dạng** của dữ liệu thật. Đã có sẵn nguyên liệu:

- `supabase/seed/saint_lucia_channel.sql` — dựng một channel với bốn trận đã tag, đã publish, có
  điểm số, ngày, và report đầu tiên cho mỗi trận. Chạy nguyên si được, chỉ cần đổi email ở dòng
  `>>> OWNER <<<` thành tài khoản test.
- `supabase/seed/uat_demo.sql` (mới) — thêm 2–3 channel giả với tên club không có thật
  (`FC Kiểm Thử`, `Test United`), đủ để thử phần "một club chỉ thấy trận của mình" mà một seed
  một-channel không thể thử được.

Quy ước một dòng, ghi ở đầu mỗi file seed: **mọi email trong seed UAT dùng một tên miền không
tồn tại** (`@uat.invalid`), trừ đúng một tài khoản chủ kênh là hộp thư thật của người test — vì
`.invalid` không nhận được thư xác nhận.

### 6.5 Project free tier ngủ sau 7 ngày

Supabase tạm dừng project ở gói free khi không có hoạt động trong khoảng một tuần (kiểm tra lại
hạn mức hiện hành lúc dựng). UAT theo định nghĩa là chạy từng đợt, nên nó **sẽ** ngủ, và triệu
chứng lại giống hệt "site hỏng": mọi request lỗi, không có thông báo nào nói "project đang ngủ".

Hai cách, chọn một (**Q3** ở §14):
- **Chấp nhận và ghi vào quy trình:** bước 0 của mọi đợt UAT là mở dashboard, bấm Resume, đợi
  ~2 phút. Rẻ, không thêm gì, nhưng người test phải biết.
- **Một cron ping:** một scheduled Worker gọi `select 1` mỗi ngày. Tốn vài dòng, giữ project
  luôn tỉnh, nhưng lại là một thứ nữa phải nuôi.

Đề xuất: **chấp nhận**, và viết đúng một dòng vào §10.1 (tiêu chí vào). Một cron chỉ để giữ ấm
một môi trường chạy từng đợt là chi phí thường trực cho một vấn đề từng đợt.

---

## 7. Quyết định 4 — Worker, R2 và email

### 7.1 Worker: `[env.uat]` chứ không phải file thứ hai

`wrangler` hỗ trợ environment ngay trong `wrangler.toml`. Một khối thêm vào, không đụng dòng nào
đang có:

```toml
# ---------- UAT ----------
# `wrangler deploy --env uat` deploy thành Worker "r2-presign-uat" — một script khác,
# một tập secret khác, cùng đúng file index.js/r2-presign.js/contact.js.
[env.uat]
name = "r2-presign-uat"

[env.uat.vars]
R2_ACCOUNT_ID  = "3e1025b807b311195e822c7f2d21f7d4"   # cùng tài khoản Cloudflare
R2_BUCKET      = "football-videos-uat"                # KHÁC bucket
R2_PUBLIC_BASE = "https://pub-<uat>.r2.dev"
ALLOW_ORIGIN   = "https://uat.hoangnams.com"          # KHÁC origin
CONTACT_TO     = "dnam2501@gmail.com"
RESEND_FROM    = "onboarding@resend.dev"
```

Secret đặt riêng cho từng env — đây là chỗ dễ quên nhất, vì `wrangler secret put X` **không** áp
sang env:

```bash
npx wrangler secret put R2_ACCESS_KEY_ID     --env uat
npx wrangler secret put R2_SECRET_ACCESS_KEY --env uat
npx wrangler secret put SUPABASE_URL         --env uat   # ← URL của project UAT
npx wrangler secret put SUPABASE_SERVICE_KEY --env uat   # ← service_role của project UAT
npx wrangler secret put RESEND_API_KEY       --env uat
npx wrangler secret put IP_SALT              --env uat
```

`SUPABASE_URL` là secret chứ không phải var (theo cách README của worker đang làm), nên nó không
đi qua `env/uat.env`. Đặt nhầm giá trị production ở đây thì **form liên hệ trên UAT ghi lead vào
database production** — và `check-endpoints.sh` không thấy được, vì nó chỉ đọc `_site`. Phép đo
bù lại nằm ở §13 Bước 4: gửi một lead từ UAT rồi đếm số dòng `public.leads` ở **cả hai** project.

### 7.2 R2: bucket riêng, và một cảnh báo về file CORS trong repo

Bucket `football-videos-uat`, bật Public Development URL, rồi đặt CORS cho origin UAT.

> ⚠️ **`worker/r2-cors.json` trong repo KHÔNG khớp policy đang chạy trên bucket production.**
> File chỉ cho `GET, HEAD`; policy thật cho `GET, PUT, HEAD`. Áp file đó lên bucket production
> sẽ **gỡ mất `PUT` và làm hỏng upload video**. Đã ghi trong `docs/film-export-cors-design.md`.
> Đừng dùng nó cho bucket nào. Với UAT, viết file mới:

```json
// worker/r2-cors.uat.json
[
  {
    "AllowedOrigins": ["https://uat.hoangnams.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag","Content-Length","Content-Range","Accept-Ranges","Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

`PUT` là bắt buộc: `cloud-sync.js` upload thẳng lên R2 bằng URL presign. `ExposeHeaders` giữ
nguyên bộ của production, vì bộ kết xuất clip đọc `Content-Range`/`Accept-Ranges` khi tua.

Và nhân dịp này: **đối chiếu policy thật của bucket production** rồi cập nhật
`worker/r2-cors.json` cho khớp, hoặc xoá file đi. Một file cấu hình nói sai về hệ thống nguy
hiểm hơn không có file nào — nó là cái bẫy đang mở sẵn.

### 7.3 Hạn mức 10 GB dùng chung

R2 free tier tính trên toàn tài khoản, không tính theo bucket. Video UAT ăn vào phần của
production. Ba biện pháp, làm cả ba:

1. **Lifecycle rule trên bucket UAT: xoá object sau 7 ngày.** Không có gì trong UAT đáng giữ quá
   một đợt test.
2. **Dùng file nhỏ.** Repo đã có `client/demo-match.mp4` (47 MB) bên cạnh `demo-fmatch.mp4`
   (894 MB). UAT dùng bản 47 MB. Cả hai đều bị `.gitignore` bỏ qua (`*.mp4`), nên chúng là file
   trên máy — cần một chỗ chung để người test lấy (§10.2).
3. **Một lần mỗi đợt, xem số:** dashboard R2 → Metrics. Nếu UAT chiếm hơn ~1 GB, có nghĩa
   lifecycle chưa chạy hoặc ai đó vừa upload trận 894 MB.

### 7.4 Email: dùng chung Resend, tách bằng nơi lưu

Không tách Resend. Lý do: sender dùng chung `onboarding@resend.dev` **chỉ gửi được tới địa chỉ sở
hữu tài khoản Resend** — mà đó chính là `CONTACT_TO`. Tạo một luồng email riêng cho UAT nghĩa là
phải verify một domain, tức là làm một việc lớn cho một lợi ích nhỏ.

Tách ở chỗ quan trọng hơn: **`public.leads` của UAT nằm trong project UAT**, vì Worker UAT mang
`SUPABASE_URL` của project UAT. Dữ liệu lead — thứ thật sự cần bảo vệ — đã tách hoàn toàn. Chỉ
có email báo là đi chung một hộp thư.

Để phân biệt trong hộp thư, đơn giản nhất là để `RESEND_FROM` khác nhau nếu sau này có domain
riêng; trước mắt, một lead UAT nhận ra được bằng chính nội dung của nó (club test, email
`@uat.invalid`). Nếu thấy chưa đủ, phương án nhỏ là thêm biến `ENV_LABEL` vào `[env.uat.vars]` và
cho `contact.js` chèn tiền tố `[UAT]` vào `subject` — **3 dòng trong `worker/contact.js`**, có
test đi kèm. Đó là **Q4** ở §14; đề xuất là **chưa làm**, cho tới khi hộp thư thật sự lẫn.
---

## 8. Quyết định 5 — luồng phát hành: cái gì được lên production

Một môi trường UAT mà production vẫn nhận thẳng mọi push thì chỉ là một trang thứ hai, không phải
một cổng. Phần này biến nó thành cổng.

### 8.1 Mô hình nhánh

```
feature/xyz ──► uat ──────────────────────► main ──► production
     │           │                            │
   test local  deploy UAT tự động        chỉ nhận fast-forward
   (1270)      + người thật ký duyệt     từ uat, không squash
```

- `uat` là **nhánh tích hợp**. Mọi thứ vào đây trước, luôn luôn.
- Lên production = `git checkout main && git merge --ff-only uat`. `--ff-only` là điều kiện then
  chốt: fast-forward đảm bảo cây file lên production **đúng bằng** cây file đã được duyệt. Squash
  hoặc merge commit tạo ra một commit chưa ai từng nhìn thấy chạy ở đâu cả.
- `main` không nhận push trực tiếp nữa (đặt branch protection, hoặc chỉ là kỷ luật nếu repo một
  người — nhưng §8.3 làm nó không còn phụ thuộc vào kỷ luật).

Hotfix production khẩn cấp: vẫn đi qua `uat`, chỉ là đi nhanh — push lên `uat`, chờ deploy UAT
(dưới một phút), mở đúng trang đang hỏng để xem nó hết hỏng, rồi ff sang `main`. Ngoại lệ duy
nhất được phép bỏ qua UAT là khi chính UAT đang hỏng, và khi đó phải ghi lý do vào commit
message.

### 8.2 Hai workflow

```yaml
# .github/workflows/deploy-uat.yml   (mới)
on:
  push: { branches: [uat] }
  workflow_dispatch:
concurrency: { group: uat, cancel-in-progress: true }   # nhóm RIÊNG, không đụng group "pages"
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node tests/run.js                       # ← test chạy TRƯỚC khi có gì được publish
      - run: bash scripts/assemble.sh uat            # gồm cả check-endpoints.sh
      - run: npx wrangler pages deploy _site --project-name=hna-uat --branch=uat
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

`concurrency: group: uat` tách khỏi `group: pages` của production — hai môi trường không bao giờ
huỷ deploy của nhau. Và `node tests/run.js` xuất hiện **lần đầu tiên trong CI** ở đây: từ nay
1270 test là điều kiện để lên được UAT, không còn là việc phải nhớ chạy tay.

`deploy.yml` giữ nguyên hình dạng, chỉ thay khối `run:` dài bằng `bash scripts/assemble.sh prod`,
và thêm hai bước: `node tests/run.js`, và cái cổng ở §8.3.

### 8.3 Cổng: một lệnh `git`, không phải một lời hứa

```yaml
# thêm vào deploy.yml, ngay sau checkout
- name: Refuse to deploy anything UAT has not seen
  run: |
    git fetch --no-tags origin uat:refs/remotes/origin/uat
    git merge-base --is-ancestor "$GITHUB_SHA" origin/uat || {
      echo "::error::commit $GITHUB_SHA không nằm trên nhánh uat — chưa qua UAT, không deploy"
      exit 1
    }
```

`git merge-base --is-ancestor A B` trả 0 khi A là tổ tiên của B. Ở đây nó phát biểu đúng một
điều: **commit đang định lên production phải từng nằm trên `uat`.** Với merge `--ff-only`, điều
kiện luôn đúng một cách tự nhiên; với một cú push thẳng lên `main` lúc 2 giờ sáng, nó đỏ.

Cần `fetch-depth: 0` (hoặc ít nhất đủ sâu) ở bước checkout để `merge-base` có lịch sử mà xét —
mặc định `actions/checkout` chỉ lấy một commit.

Điều mà cổng này **không** phát biểu: rằng có người đã thật sự nhìn UAT. Nó chỉ chặn code chưa
từng đi qua đó. Ai đó vẫn có thể merge sang `uat` rồi ff sang `main` trong ba giây. Bịt nốt kẽ đó
cần một tag `uat-ok/<sha>` do người ký duyệt tự đặt, và workflow kiểm tag thay vì kiểm nhánh —
đáng làm khi có nhiều hơn một người phát hành, không đáng lúc này. Ghi ở đây để lần sau không
phải nghĩ lại.

### 8.4 Rollback

| | UAT | Production |
|---|---|---|
| Cách nhanh | Cloudflare Pages → Deployments → Rollback (một cú bấm) | không có nút; phải deploy lại |
| Cách đúng | push lại nhánh `uat` | `git revert` rồi push `main` (workflow tự chạy) |
| Thời gian | ~5 giây / ~1 phút | ~1–2 phút |
| Bẫy | bản rollback vẫn giữ `?v=` cũ → trình duyệt người test có thể còn giữ file mới. Bảo họ hard-reload, hoặc dựa vào `no-store` ở §9.2 | artifact của run cũ hết hạn theo retention; đừng trông vào "re-run job cũ" |

---

## 9. Truy cập, và không để lọt ra ngoài

Ba lớp, làm cả ba. Không lớp nào một mình đủ.

### 9.1 Cổng người: Cloudflare Access

Zero Trust → Access → Application, bọc `uat.hoangnams.com`, policy `Allow` cho một danh sách
email cụ thể, phương thức **One-time PIN** (không cần tài khoản Cloudflare cho người test). Free
tới 50 người dùng — nhiều hơn nhu cầu vài chục lần.

Điểm cần biết trước khi dựng: Access đặt cookie ở tầng cạnh, **trước** khi request tới site. Nó
không biết gì về `auth.js` và không thay thế nó — người test sẽ đăng nhập **hai lần**: một lần
vào môi trường (Access), một lần vào ứng dụng (Supabase). Đó đúng là điều ta muốn, vì luồng đăng
nhập ứng dụng chính là thứ đang được test.

Kiểm tra sau khi bật, từ một máy không có cookie:

```bash
curl -sI https://uat.hoangnams.com/ | head -3       # kỳ vọng 302 về cloudflareaccess.com
```

### 9.2 `_headers`: không index, không cache HTML

```
# _headers — Cloudflare Pages đọc file này ở gốc thư mục publish
/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
```

`X-Robots-Tag` mạnh hơn `robots.txt`: `robots.txt` xin công cụ tìm kiếm đừng **thu thập**, header
này nói đừng **lập chỉ mục**. Với Access đứng trước thì bot vốn đã không vào được, nhưng ba lớp
là ba lớp.

`Cache-Control: no-store` cho **toàn bộ** UAT là có chủ ý, và nó là chỗ UAT cố tình khác
production: ở UAT, file đổi liên tục mà `?v=` chưa bump, nên cache là kẻ thù thuần tuý. Đánh đổi
phải nói rõ: **UAT vì thế không thể tái hiện bug do cache** — chính là lớp bug của `46bfb56`.
Lớp đó chỉ production mới có, và §11.1 ghi nó vào danh sách giới hạn.

`_headers` được `scripts/assemble.sh` ghi ra chỉ khi `ENV=uat`, để `_site` production không mang
theo một file vô nghĩa (GitHub Pages không đọc nó).

### 9.3 Nhìn là biết đang ở đâu

Bug tệ nhất của một môi trường song song là bug về con người: ai đó tag hai tiếng ở UAT rồi hỏi
sao khách không thấy dữ liệu. Một dải màu là đủ, và nó phải **tự nhận ra mình** chứ không phải
được truyền vào lúc build:

```html
<!-- một lần, cuối <body> — không phải file riêng, không có ?v= để quên bump -->
<script>
  if (location.hostname.indexOf('uat.') === 0) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;' +
      'color:#fff;font:600 12px system-ui;text-align:center;padding:3px">' +
      'UAT — dữ liệu ở đây là giả, không phải của khách</div>');
  }
</script>
```

Khoá theo `location.hostname`, không theo cờ build, vì hai lý do: file giống hệt nhau ở hai môi
trường (dễ so sánh, dễ chứng minh), và không sinh thêm một biến thể asset nào cần `?v=` — đúng
tinh thần cảnh báo trong `asset-versions.test.js`.

Chi phí: đoạn này phải nằm trong `client/index.html`, `client/app.html`, `client/login.html`,
`client/guide.html`, `index.html`, `Stats/index.html`, `Player-Lists/index.html`, `auth.html` —
8 trang. Nếu 8 chỗ là quá nhiều, phương án B là chỉ đặt ở trang có `shared.js`/`site.css` chung.
Đây là **Q5** ở §14.

---

## 10. Quy trình UAT — một tính năng mới đi qua như thế nào

### 10.1 Tiêu chí vào (entry) — không đủ thì chưa gọi là sẵn sàng test

1. `node tests/run.js` xanh toàn bộ, **và** test mới cho tính năng mới đã có trong đó.
2. Đã merge vào `uat`, workflow `deploy-uat` xanh, `check-endpoints.sh` in ✅.
3. Supabase UAT **đang tỉnh** (§6.5 — mở dashboard, Resume nếu cần, đợi ~2 phút).
4. Seed đã có đủ dữ liệu cho kịch bản: ít nhất một channel, một trận đã publish, một trận chưa.
5. Có ghi chú kèm theo: tính năng làm gì, **và mong người test bấm vào đâu**. Một đợt UAT không
   có kịch bản là một đợt nhấp chuột ngẫu nhiên.

### 10.2 Vai

| Vai | Ai | Làm gì |
|---|---|---|
| Người phát hành | tác giả | merge vào `uat`, xác nhận deploy xanh, viết kịch bản, giữ file video demo ở chỗ người test lấy được |
| Người test | analyst | chạy kịch bản trên trình duyệt thật, ghi lại cái thấy, không đọc code |
| Người ký duyệt | chủ sản phẩm | quyết định "được" hay "chưa được", không phải "có bug hay không" |

Trong repo một người, ba vai vẫn nên tách theo **thời điểm**: đừng test ngay sau khi viết. Người
test phải mở kịch bản ra và làm theo nó, không làm theo trí nhớ về code.

### 10.3 Kịch bản test cho các tính năng mới nhất

Cột giữa là lý do của cả tài liệu này: **thứ mà chỉ UAT mới thấy được**, đối lập với thứ 1270
test đã lo rồi.

| # | Tính năng (commit) | Chỉ UAT mới thấy được | Bấm gì | Đạt khi |
|---|---|---|---|---|
| 1 | Guidelines dưới video (`928d508`) | `guide.js` kéo video từ `…r2.dev/guide/` — **bucket UAT chưa có thư mục đó** | mở trang Guidelines, phát một mục | video chạy. Nếu 404 → phải copy thư mục `guide/` sang bucket UAT, **không phải bug code** |
| 2 | Xuất clip (`46bfb56`) | CORS thật + `crossorigin` + cache thật của R2 UAT | mở Film, chọn một đoạn, bấm ⭳ | file `.mp4` tải về, không hiện `NEED_CORS` |
| 3 | Form liên hệ (`78e2b55`) | Worker thật, Resend thật, `leads` thật, `ALLOW_ORIGIN` mới | gửi thử từ landing page UAT | (a) không lỗi CORS ở Console (b) có 1 dòng trong `leads` của **project UAT** (c) `leads` production **không tăng** |
| 4 | Đăng ký + xác nhận email | Site URL / Redirect URLs của project UAT (§6.3) | đăng ký bằng hộp thư thật, bấm link trong mail | về đúng `uat.hoangnams.com/...`, vào thẳng, **không** rơi về production hay `localhost:3000` |
| 5 | Upload video (`cloud-sync.js`) | presign thật, `PUT` CORS thật, quota thật | upload `demo-match.mp4` (47 MB) | lên xong, phát được, và object nằm trong bucket **UAT** |
| 6 | Filter/phím tắt ở Clips (`cd650cb`) | tiêu điểm bàn phím thật giữa các phần tử DOM thật | gõ vào ô filter rồi bấm phím tắt | phím đi vào ô, không kích hoạt hành động |
| 7 | Xuất Stats XLSX/CSV (`c3a8a61`) | trình duyệt thật ghi file thật; sheet là tab | bấm xuất ở cả hai định dạng | file mở được ở Excel, số sheet đúng, CSV là **một** file |
| 8 | Match Report PDF (`3547139`, `8f0c7af`) | `exportPdf()` ghi file thật — sandbox không chặn được | xuất report của một trận đã seed | PDF mở được, số trang khớp mục lục |
| 9 | Macro / phím tắt riêng (`e3ebce7`, `0020_user_prefs`) | prefs lưu **per-user** trong DB, phải kiểm bằng hai tài khoản | đặt macro ở tài khoản A, mở tài khoản B | B không thấy macro của A |
| 10 | Player Data / role cards (`78bf628`, `77b8637`) | dữ liệu thật từ view Supabase, RLS thật | mở Player Data của trận đã publish | dot nằm trên sân, tỉ lệ có mẫu số, không ô trống |
| 11 | Phân tách channel (RLS, `0013`–`0018`) | **chỉ** database thật kiểm được | đăng nhập club A, thử mở trận của club B qua URL trực tiếp | không thấy dữ liệu — và đây là test quan trọng nhất bảng này |
| 12 | Trận chưa publish | RLS + view `public_match_stats` | club mở danh sách khi trận chưa publish | không hiện; hiện ngay sau khi analyst publish |

Dòng 11 đáng được nhắc riêng: mọi test còn lại kiểm rằng tính năng chạy được; dòng 11 kiểm rằng
dữ liệu của một club **không** rò sang club khác. Đó là thứ không có gì trong `tests/` chạm tới
được, vì trong sandbox không có Postgres và không có JWT — và cũng là thứ đắt nhất nếu sai.

### 10.4 Bug đi ngược lại thế nào

Ghi lại theo đúng ba dòng này, không hơn:

```
Ở đâu:   uat.hoangnams.com/app.html, Chrome 1xx, tài khoản test-2@uat.invalid
Làm gì:  mở trận "Test United vs FC Kiểm Thử" → tab Film → bấm ⭳ trên đoạn 12:03–12:18
Thấy gì: nút quay tròn ~2 giây rồi hiện "Không mở được video". Console: (dán nguyên văn)
```

Rồi: sửa trên nhánh feature → test → merge `uat` → deploy → **người báo bug xác nhận lại**. Người
sửa không tự đóng bug của mình.

### 10.5 Tiêu chí ra (exit) — điều kiện để ff sang `main`

1. Mọi dòng trong kịch bản đạt, hoặc dòng không đạt đã được ghi lại và **chấp nhận có ý thức**
   (ghi vào commit message hoặc PR, không để trong đầu).
2. Không có lỗi đỏ nào trong Console ở các trang đã mở.
3. `leads` / bảng dữ liệu của project **production** không đổi trong suốt đợt test — phép kiểm
   một dòng SQL, và là bằng chứng cuối cùng rằng hai môi trường thật sự tách nhau.
4. `git merge --ff-only uat` chạy được (nếu không được, tức là `main` đã đi trước — dừng lại và
   tìm hiểu vì sao, đừng ép).

Chỗ để dành cho sau: khi kịch bản ở §10.3 ổn định, các dòng 2, 5, 7, 8 là ứng viên tự động hoá
bằng Playwright chạy trên UAT sau mỗi deploy. Không làm trong lần này (§2).
---

## 11. Cái UAT này KHÔNG chứng minh được

Một môi trường song song hứa quá lời thì nguy hiểm hơn không có, vì nó tạo cảm giác đã kiểm rồi.
Dưới đây là danh sách trung thực những chỗ UAT **không** đại diện cho production, viết ra để
không ai trông vào nó.

### 11.1 Cache — cố tình khác

`Cache-Control: no-store` ở §9.2 làm UAT không thể tái hiện lớp bug cache. Mà đó không phải lớp
bug lý thuyết: `46bfb56` là đúng lớp đó, và nó tốn một ngày. Bug cache chỉ xuất hiện ở
production, ở lần truy cập thứ hai của một người đã từng vào.

Bù lại bằng thói quen, không bằng môi trường: sau mỗi lần deploy production có sửa asset, mở
trang bằng một cửa sổ **đã từng vào site** (không phải ẩn danh) và xác nhận số `?v=` trên tab
Network đúng bằng số trong `tests/asset-versions.json`.

### 11.2 Hosting — hai nhà cung cấp khác nhau

GitHub Pages (production) và Cloudflare Pages (UAT) tự quyết định: header mặc định, quy tắc
trailing slash, xử lý `/auth` → `auth.html`, trang 404, và thứ tự nén. README đã ghi rằng
**chỉ GitHub Pages** phân giải đường dẫn đẹp `/auth`, và ngoài site live thì `auth.js` mở
`auth.html` theo tên.

Nên phép đo đầu tiên sau khi dựng xong không phải là mở trang chủ, mà là:

```bash
curl -sI https://uat.hoangnams.com/tagger/auth        # 200 hay 301 hay 404?
curl -sI https://uat.hoangnams.com/tagger/            # có index.html không
curl -sI https://uat.hoangnams.com/auth               # bản tương thích ở gốc
```

Ba dòng này phải cho ra kết quả **giống production**. Nếu khác, có hai lựa chọn: thêm `_redirects`
cho Cloudflare Pages để bắt chước, hoặc ghi lại khác biệt vào chính tài liệu này. Không được để
nó là điều bất ngờ giữa buổi test — một tester gặp 404 ở `/auth` sẽ báo "đăng nhập hỏng", và cả
buổi sẽ đi tìm một bug không tồn tại.

### 11.3 Email — cùng một trần

Mailer mặc định của Supabase giới hạn vài thư mỗi giờ. Một đợt UAT tạo 5–6 tài khoản là chạm
trần, và triệu chứng là thư **không tới** chứ không phải báo lỗi. Cách tránh: tạo trước tài khoản
test một lần, tái sử dụng qua nhiều đợt; chỉ đăng ký mới khi đang test đúng luồng đăng ký.

Resend gói free có trần theo ngày; form liên hệ ở UAT nên gửi vài lần rồi thôi, không dùng để
thử tải.

### 11.4 DNS trên máy này — bẫy đã biết

Máy đang dùng nhận DNS lừa từ router (Aeza), và `hoangnams.com` phân giải ra một IP không phải
GitHub Pages. `client/demo-cdp.js` đã phải đi vòng bằng cách chạy Chrome với:

```
--host-resolver-rules=MAP hoangnams.com 185.199.110.153,MAP www.hoangnams.com 185.199.110.153
```

`uat.hoangnams.com` là một bản ghi mới trên cùng tên miền đó, nên **rất có thể gặp đúng vấn đề**,
và triệu chứng sẽ giống hệt "UAT chưa deploy xong" hoặc "Cloudflare Access chặn". Trước khi kết
luận bất cứ điều gì về UAT từ máy này:

```bash
nslookup uat.hoangnams.com 1.1.1.1     # nguồn sạch
nslookup uat.hoangnams.com             # nguồn mà máy đang thật sự dùng
```

Hai kết quả khác nhau nghĩa là vấn đề nằm ở máy, không nằm ở UAT. Việc nhiễm độc là **có chọn
lọc**, nên một tra cứu sạch không chứng minh được gì cho tên miền khác — phải tra đúng
`uat.hoangnams.com`.

### 11.5 Những chỗ còn lại

- **Quy mô.** UAT có 3 channel và vài trận. Bug chỉ xuất hiện với 200 trận sẽ không xuất hiện ở đây.
- **Thiết bị.** Người test dùng máy của mình. UAT không nói gì về Safari trên iPad nếu không ai mở
  Safari trên iPad.
- **Nội dung.** Video UAT là `demo-match.mp4` 47 MB. Trận thật 894 MB có hành vi tua, buffer và
  bộ nhớ khác hẳn — dòng 2 và 5 trong §10.3 **không** đại diện cho trận thật.
- **Migration một chiều.** UAT chứng minh migration chạy được trên database trắng. Nó không chứng
  minh migration chạy được trên **dữ liệu production hiện có** — muốn thế phải khôi phục một bản
  sao có cấu trúc tương đương, và đó là việc lớn hơn, để dành.

---

## 12. Chi phí và hạn mức

| Thứ | Gói | Hạn mức | UAT ảnh hưởng gì |
|---|---|---|---|
| Cloudflare Pages | Free | build/tháng có giới hạn; request không | đủ xa |
| Cloudflare Access | Free | ≤ 50 người dùng | đủ xa |
| Supabase project #2 | Free | **2 project free/tổ chức** → dùng hết suất | ngủ sau ~7 ngày (§6.5) |
| Cloudflare Worker | Free | ~100k request/ngày **chung tài khoản** | UAT ăn chung, lượng không đáng kể |
| R2 | Free | **10 GB chung**, không tách bucket | ăn chung — chặn bằng lifecycle (§7.3) |
| Resend | Free | trần theo ngày, chung | ăn chung |
| GitHub Actions | Free cho repo public | — | thêm một workflow |

**Tiền mặt tăng thêm: 0.** Cái thật sự tiêu là **suất project free thứ hai của Supabase** và
**10 GB R2 dùng chung**. Nếu sau này cần project free thứ ba, phải nâng gói hoặc bỏ UAT — nên
biết trước con số đó, đừng để phát hiện lúc đang cần.

---

## 13. Kế hoạch thi công — sáu bước, mỗi bước có phép nghiệm thu

Thứ tự có chủ ý: rủi ro cao nhất (refactor khâu dựng) làm trước, khi chưa có gì phụ thuộc vào nó.

### Bước 1 — `scripts/assemble.sh`, chứng minh production không đổi một byte

```bash
# lấy _site do workflow hiện tại dựng (chạy tay đúng khối run: trong deploy.yml)
bash /tmp/old-assemble.sh && mv _site /tmp/site-old
bash scripts/assemble.sh prod
diff -r /tmp/site-old _site && echo "byte-identical"
```

**Nghiệm thu:** `diff -r` không in gì. Cộng `node tests/run.js` xanh sau khi sửa hằng số đường
dẫn ở 8 file test (§5.6). Chưa deploy gì cả ở bước này.

### Bước 2 — Cloudflare Pages + domain + Access, với `_site` production tạm thời

Dựng project `hna-uat`, trỏ `uat.hoangnams.com`, bật Access, deploy **bản prod** lên đó một lần
(chưa có backend UAT). Mục đích duy nhất: đo hosting.

**Nghiệm thu:** ba lệnh `curl` ở §11.2 cho kết quả giống production; `curl -sI /` không có cookie
trả về chuyển hướng Access; header có `X-Robots-Tag`. Sau khi đo xong, **xoá deployment đó ngay**
— một bản trỏ vào database production nằm trên origin UAT là đúng thứ tài liệu này tồn tại để
ngăn.

### Bước 3 — Supabase UAT

Tạo project, `supabase db push`, đặt sáu mục ở §6.3, chạy hai file seed.

**Nghiệm thu:** đăng ký một tài khoản test bằng hộp thư thật; link trong email dẫn về
`uat.hoangnams.com`; đăng nhập được; thấy channel đã seed. Và:

```sql
-- chạy trên project UAT
select count(*) from public.matches;   -- > 0
select count(*) from auth.users;       -- đúng bằng số tài khoản test vừa tạo
```

### Bước 4 — Worker `[env.uat]` + bucket R2 UAT

Deploy `--env uat`, đặt 6 secret, tạo bucket, áp `r2-cors.uat.json`, đặt lifecycle 7 ngày, copy
thư mục `guide/` sang bucket UAT (nếu không, dòng 1 ở §10.3 sẽ bị báo nhầm là bug).

**Nghiệm thu:**

```bash
curl -sI -H "Origin: https://uat.hoangnams.com" -H "Range: bytes=0-1" \
     https://pub-<uat>.r2.dev/<một object>
# kỳ vọng: 206 + Access-Control-Allow-Origin: https://uat.hoangnams.com

curl -sX OPTIONS -H "Origin: https://uat.hoangnams.com" \
     -H "Access-Control-Request-Method: PUT" -i https://pub-<uat>.r2.dev/x | head -8
# kỳ vọng: 204 + Access-Control-Allow-Methods có PUT
```

Cộng phép đếm hai chiều: gửi một lead từ UAT → `public.leads` **project UAT** tăng 1, **project
production không đổi**.

### Bước 5 — `env/uat.env` + `deploy-uat.yml`, deploy thật lần đầu

**Nghiệm thu:** log workflow in `✅ uat: không còn endpoint lạ trong _site`, và trên trang đã
deploy:

```bash
curl -s https://uat.hoangnams.com/assets/supa.js | grep -c xtzmtdcohoixoxqusyyz   # phải là 0
curl -s https://uat.hoangnams.com/tagger/cloud-sync.js | grep -c hoangnam25012004 # phải là 0
curl -s https://uat.hoangnams.com/auth.js | grep -c xtzmtdcohoixoxqusyyz          # phải là 0 (bản gốc!)
```

Dòng thứ ba là bản `auth.js` ở gốc site — bản dễ quên nhất, và là lý do §5.3 quét cả thư mục thay
vì quét danh sách.

### Bước 6 — cổng production + chạy thử nguyên quy trình

Thêm cổng ở §8.3 vào `deploy.yml`. Rồi cho một thay đổi vô hại (một dòng chữ) đi trọn vòng:
`feature` → `uat` → deploy UAT → nhìn thấy → `--ff-only` → `main` → production.

**Nghiệm thu:** thấy đúng dòng chữ đó trên production; và thử push thẳng một commit lên `main`
để xác nhận cổng **đỏ** (rồi revert). Một cái cổng chưa từng chặn ai là một cái cổng chưa biết
có đóng hay không.

---

## 14. Câu hỏi cần chốt

| | Câu hỏi | Lựa chọn | Đề xuất |
|---|---|---|---|
| **Q1** | UAT đứng ở đâu? | **A.** Repo thứ hai + GitHub Pages (giống prod nhất, nhưng công khai, không chặn được ai) · **B.** Cloudflare Pages + `uat.hoangnams.com` (chặn được người, rollback một cú bấm, khác nhà cung cấp) · **C.** Worker tĩnh | **B** — §4.2 |
| **Q2** | Danh sách `cp` để ở đâu? | **A.** `scripts/assemble.sh` dùng chung, sửa hằng số đường dẫn ở 8 file test · **B.** mỗi workflow một danh sách | **A** — B là drift có bảo đảm, §5.6 |
| **Q3** | Supabase UAT ngủ sau 7 ngày? | **A.** chấp nhận, Resume ở bước 0 mỗi đợt · **B.** cron ping giữ tỉnh | **A** — §6.5 |
| **Q4** | Email UAT có gắn nhãn `[UAT]`? | **A.** chưa, phân biệt bằng nội dung lead · **B.** thêm `ENV_LABEL`, 3 dòng trong `contact.js` + test | **A** cho tới khi hộp thư thật sự lẫn — §7.4 |
| **Q5** | Dải báo "UAT" đặt ở mấy trang? | **A.** cả 8 trang · **B.** chỉ các trang chính | **A** — trang bị quên là trang gây nhầm lẫn, §9.3 |
| **Q6** | Ai được ký duyệt UAT? | **A.** tác giả tự ký (repo một người) · **B.** bắt buộc một người thứ hai · **C.** A bây giờ, B khi có analyst thứ hai | **C** — và khi sang B thì bổ sung tag `uat-ok/<sha>` ở §8.3 |

---

## 15. Phụ lục — file sẽ thêm và sửa

| File | Thêm/Sửa | Nội dung |
|---|---|---|
| `scripts/assemble.sh` | mới | danh sách `cp` (chuyển nguyên văn) + ghi đè cấu hình + gọi cái chặn |
| `scripts/check-endpoints.sh` | mới | chặn hai chiều, đọc `_site`, không đọc danh sách |
| `env/prod.env` | mới | 4 giá trị công khai, đúng bằng cái đang nằm trong code |
| `env/uat.env` | mới | 4 giá trị công khai của UAT |
| `.github/workflows/deploy.yml` | sửa | khối `run:` → `bash scripts/assemble.sh prod`; thêm `node tests/run.js`; thêm cổng `--is-ancestor`; `fetch-depth: 0` |
| `.github/workflows/deploy-uat.yml` | mới | on push `uat`, test → assemble uat → `wrangler pages deploy` |
| `worker/wrangler.toml` | sửa | thêm khối `[env.uat]` + `[env.uat.vars]`, **không đụng phần đang có** |
| `worker/r2-cors.uat.json` | mới | CORS bucket UAT: `GET, PUT, HEAD`, origin UAT |
| `worker/r2-cors.json` | **cần xử lý riêng** | đang nói sai về bucket production (thiếu `PUT`) — sửa cho khớp hoặc xoá |
| `supabase/seed/uat_demo.sql` | mới | 2–3 channel giả, email `@uat.invalid` |
| `tests/*.test.js` (8 file) | sửa | một hằng số đường dẫn mỗi file |
| 8 trang HTML | sửa | dải báo UAT theo `location.hostname` (nếu chốt Q5=A) |
| `README.md` | sửa | mục mới: hai môi trường, địa chỉ nào là gì, luồng phát hành |
| `_headers` | sinh ra lúc build | chỉ khi `ENV=uat` |

**Không đụng tới:** `index.html`, `shared.js`, `shared.css`, `cloud-sync.js`, `auth.js`,
`Stats/*`, `Player-Lists/*`, `client/assets/*`, `worker/r2-presign.js`, `worker/contact.js`
(trừ khi chốt Q4=B), và **không** `?v=` nào phải bump.

---

## 16. Ba câu tóm lại

1. **UAT phải khác origin.** Không phải vì đẹp, mà vì `localStorage` và cache HTTP chia theo
   origin, và dùng chung origin sẽ trộn dữ liệu test vào phiên làm việc thật (§4.1).
2. **Cấu hình phải được chặn, không phải được nhớ.** Bốn chuỗi nằm trong năm file, và ba trong số
   đó nằm ở chỗ không ai nghĩ tới — nên cái quyết định an toàn là `check-endpoints.sh` đọc kết
   quả dựng, không phải một danh sách file (§5).
3. **Cổng phát hành phải là một lệnh, không phải một thói quen.** `git merge-base --is-ancestor`
   là toàn bộ phần "đã qua UAT" của quy trình này; phần còn lại là con người, và con người thì
   quên (§8.3).
