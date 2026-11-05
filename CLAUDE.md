# CLAUDE.md — HoangNam Analytics

Football event-data service. Analysts tag matches in the **tagger**. Clubs read the result
in the **portal**. Both are static sites on GitHub Pages. They share one Supabase project.
There is no build step, no bundler and no package.json at the root.

| | Repo | Live URL | Users |
|---|---|---|---|
| Tagger (collection) | `apps/tagger/` | https://hoangnams.com/tagger/ | our analysts |
| Portal (delivery) | `apps/portal/` | https://hoangnams.com/ | clubs, plus the public landing page |
| Edge worker | `services/edge-worker/` | `r2-presign.<acct>.workers.dev` | both apps (R2 upload presign, `/contact`) |
| Database | `supabase/` | project `xtzmtdcohoixoxqusyyz` | both apps |

The old `hoangnam25012004.github.io/Football-Data-Labeling-Website/*` URLs 301-redirect to
hoangnams.com. They stay in the OAuth and Supabase allow-lists on purpose.

## Layout

```
apps/tagger/        index.html (tagging tab, ~4.7k lines, inline <script>), auth.html/.js,
                    cloud-sync.js, shared.js/.css, shared-page.css,
                    Stats/ (index.html, stats-view.js, stats-view.css, report.js = PDF),
                    Player-Lists/ (line-ups, formation board)
apps/portal/        index.html (landing), app.html (channel app), login.html, guide.html,
                    privacy.html, assets/ (app.js, supa.js, film-tools.*, guide.*, *.css)
                    demo-*/chrome-profile here are local-only and git-ignored
services/edge-worker/   index.js routes: "/" → r2-presign.js, "/contact" → contact.js
supabase/           migrations/NNNN_*.sql (apply in order), seed/
data/definitions/   pitchtagger_events.json (the event dictionary the tests pin)
scripts/            gen-event-types-sql.js; console/ = paste-into-DevTools scripts
deliverables/       match-reports/ (only the Hanley Town sample PDF is tracked), marketing/ (ignored)
docs/design/        <feature>-design.md, one per feature, written before the code
docs/landing-pages/ one doc per served page: every feature, the functions behind it (file:line), its data.
                    Change a page's behaviour → update its doc here (README.md there is the index)
tests/              node tests/run.js
```

**The live URLs are the contract and the repo layout is not.** `.github/workflows/deploy.yml`
builds `_site/` from an explicit `cp` list: the portal goes to `/` and the tagger goes under
`/tagger/`. You may change the left side of a `cp` line. Never change the right side: that
breaks bookmarks, confirmation-email links, `#match=` links already sent to clubs, and the
Supabase/Google redirect allow-lists. `Stats/` and `Player-Lists/` keep their capitalisation
for the same reason.

## Commands

```bash
node tests/run.js                          # whole suite (~1589 tests, no install). Must stay green.
node tests/<name>.test.js                  # one file
node tests/asset-versions.test.js          # run WITHOUT --update first; it tells you what to bump
node tests/asset-versions.test.js --update # only after bumping every ?v= it named
node scripts/gen-event-types-sql.js        # regenerate 0021 seed from the dictionary (--stdout to preview)
python -m http.server 8765                 # from the REPO ROOT; open /apps/tagger/ and /apps/portal/app.html
cd services/edge-worker && npx wrangler deploy   # worker deploys by hand, not from CI
```

Pushing to `main` deploys the live site. Nothing else does.

## Rules that bite (read before editing)

1. **A new served file needs a `cp` line in deploy.yml.** Without one it 404s live while CI
   stays green. When you verify a deploy, curl the *deployed* path (`/assets/x.js`,
   `/tagger/Stats/x.js`), never the repo path. The repo path returns the 404 page with 200-ish caching.
2. **Cache-busting `?v=N` is manual.** If you edit a versioned asset, bump its `?v=` on *every*
   page that loads it, then run `--update`. The bump cascades: `apps/portal/assets/app.js`
   loads `Stats/stats-view.js?v=`, `Stats/report.js?v=` and `shared.js?v=` at runtime, so
   bumping one of those edits app.js, and app.js then needs its own bump in `app.html`.
   `app.css` is loaded by app.html, guide.html *and* login.html.
3. **The tagger keeps its own copy of the stat engine.** `apps/tagger/index.html` does not load
   `shared.js`, and the sub-pages (Stats, Player-Lists) and the portal do. A change to stat
   rules, `EV_ALIAS`, lineup storage or the formation arranger usually needs a twin edit in
   both. Tests assert parity for several of these.
4. **`Stats/stats-view.js` is mounted in two places**: the tagger's Stats page and the
   portal's Analysis tab, which is fed a frozen `match_reports` payload instead of live
   events. The user's standing ask on Stats work is "no bug in the other tabs". Prove it by
   diffing rendered screens and the CSV/XLSX/PDF output against HEAD.
5. **Event names are data, and they live in five places**: `DEFAULT_EVENTS` (index.html),
   `data/definitions/pitchtagger_events.json` (a test asserts these two match), migration
   0021 (generated by the script above), the `private.match_stats_mv` rollup in 0026 (matched by name in SQL; `match_stats` reads it, a test pins it to 0015's list),
   and the live `public.event_types`, which has ~10 names the repo does not know.
   - **Adding** an event: `DEFAULT_EVENTS` only reaches a browser that has never visited.
     Ship the name, then push it to the cloud with a console script
     (`scripts/console/seed_gk_events.js` is the template). Don't use the ＋ Add button.
   - **Renaming** an event: add the old→new pair to `EV_ALIAS` (shared.js *and* index.html)
     and let `evKey` fold it. Already-tagged matches keep the old spelling forever.
   - Prefer two-character hotkeys. Run any "is this code free?" check against the live list,
     because an event hotkey silently beats a macro with the same code.
6. **Supabase**
   - Never edit an applied migration. Add the next `NNNN_*.sql` instead.
   - Tagging data (`events`, `players`, writes to `teams`/`event_types`/`matches`) is staff-only
     from 0026. A new analyst needs a `public.staff` row before they can tag. Anonymous sign-ins
     are still on, and such a session can read the dictionary and nothing else.
   - The portal's list numbers come from `private.match_stats_mv`, refreshed by pg_cron each
     minute (only when `events` changed). Stale list numbers mean: check `cron.job_run_details`.
   - Row-Level Security is the security boundary. `auth.js` is only a UX gate, because the
     files are public.
   - The anon key in `cloud-sync.js` is public by design. The service-role key lives only
     in the Worker's secrets.
   - Views run with their owner's rights, so RLS does not reach `match_stats`. Anon reads go
     through `public_match_stats`.
   - `0017_public_channels` makes a channel's whole report, player names included, world-readable.
   - To probe a grant without writing anything, PATCH `id=eq.00000000-0000-0000-0000-000000000000`.
     A `42501` means a missing GRANT. A `204` says nothing about RLS.
7. **Portal CSS loses ties to tagger CSS.** `shared.css` and `stats-view.css` are injected at
   runtime, *after* `app.css`. To override a tagger class from the portal, use `body.app .x`
   (higher specificity). Putting the rule later in `app.css` does not work.
8. **Served files are English-only.** A test fails on Vietnamese in tagger sources. The user
   writes to you in Vietnamese, and design docs are often Vietnamese. Both are fine.
9. **The landing page (`apps/portal/index.html`) may only promise what the code does.** Grep
   for the feature first. Pricing, turnaround and roadmap claims are the user's call, so ask.
10. **Dashboards and the PDF carry no explanatory notes.** Put reconciliations in the design
    doc and lock them with a test. Ask before adding a caption to a map.

## Tests

- No framework (`tests/tiny-test.js`). `tests/harness.js` lifts functions and consts **by
  name** out of the shipped sources (brace-matching scan) and runs them in `vm` with DOM,
  video and cloud stubs. A rename shows up as "not found".
- **Path rule**: a path starting with a top-level folder (`apps/`, `services/`, `supabase/`,
  `data/`, `scripts/`, `docs/`, `tests/`, `.github/`) is repo-relative. Anything else
  (`'index.html'`, `'Stats/stats-view.js'`) is relative to `apps/tagger/`. Use
  `readSrc()`/`repoPath()` from the harness and don't call `path.join(ROOT, …)`.
  `asset-versions.test.js` is the exception: it writes full repo paths, because it compares
  them with deploy.yml's `cp` sources.
- "unbalanced source while scanning" means a regex literal that contains a quote. The
  scanner can't parse those. It is not a broken edit.
- CRLF: git has `autocrlf` on. Python writes need `newline=''`. Some tests read raw source,
  so check line endings when a source-pattern test fails right after a merge.
- Many tests also assert on `deploy.yml` lines (`cp apps/portal/...`). If you move a file,
  update those tests too.

## Verifying in a browser

- The in-app Browser pane is unreliable on this machine: screenshots hang, and rAF never
  fires. Fall back to headless Chrome from Bash
  (`chrome.exe --headless=new --screenshot=… http://localhost:PORT/…`), or to jsdom/`vm`.
  Assert on `getBoundingClientRect`/`getComputedStyle` rather than pixels.
- `PTReport.exportPdf()` writes a real file to Downloads. Stop at `PTReport.buildPages()`.
- Real report payloads without auth: the Saint Lucia channel is public, so read
  `match_reports` with the anon key.

## Git workflow

- Branch → commit → `git merge --no-ff <branch> -F <message-file>` into `main`. Here
  `-F -` from stdin fails. Check that `HEAD^{tree}` matches the verified branch tree.
- When the user says "push" they mean `main`, since that is what deploys. Finish the branch,
  then offer the merge in the same turn, with the tests already green.
- `gh` is not installed. Check deploys at
  `https://api.github.com/repos/Hoangnam25012004/Football-Data-Labeling-Website/actions/runs?per_page=3`.

## Domain glossary

- **Channel**: one club. Members are admin/analyst/viewer. A club sees only its own
  *published* matches.
- **Submit Analysis**: freezes a match into a versioned `match_reports` row (events,
  line-ups, sub history, half↔video map). This is what the portal reads, and it never reads
  `public.events`.
- **Entry box**: events are typed as player + hotkeys + receiver (e.g. `1qq*s2`).
  **Macros** expand one code into a chain of events. Hotkeys and macros are stored per user
  (`user_prefs`).
- **Dots**: pitch coordinates (`x,y`, receiver `rx,ry`). **Goal spot**: where a shot on
  target or a goal crossed the line (`goal_x/goal_y`).
- **Film**: the portal's video player with telestration (`film-tools.js`). Videos live on
  Cloudflare R2.

## Environment notes

- Windows 11, Git Bash plus PowerShell. CDN libs: supabase-js@2, xlsx 0.18.5 (community
  build: no `!freeze`, no cell styles), jsPDF 2.5.1, html2canvas 1.4.1.
- The home router hands out rogue DNS (Aeza). A cert error or "dangerous site" warning on
  hoangnams.com may be interception, not the site.
- `.github/workflows/health.yml` probes every service hourly and is also the Supabase
  keep-alive (Free plan pauses after 7 idle days). `backup.yml` takes a weekly gpg-encrypted
  pg_dump once `SUPABASE_DB_URL` + `BACKUP_PASSPHRASE` secrets exist. CI runs the suite before
  every deploy and curls every deployed file afterwards.
- The R2 bucket's CORS is configured correctly. A missing `Access-Control-Allow-Origin` on
  Film export is Chrome's cache.
