# HoangNam Analytics — client site + labeling app

Two websites in one repository, sharing one Supabase project.

| | What it is | Who uses it | Lives at |
|---|---|---|---|
| **Client site** | Marketing pages plus the app clubs log into: one channel per club, holding matches, data and players | Customers | `/` |
| **Labeling app** | The tagging tool — events + hotkeys, pitch coordinates, stats, XLSX/CSV export | Our analysts | `/tagger` |

**Client site:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/
**Client app:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/app.html
**Labeling app:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/tagger/
**Analyst sign-in:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/tagger/auth

> **The labeling app moved.** It used to be the site root; the client site now is.
> Old bookmarks to `/` land on the client site. Sign-in still works either way —
> `auth.js` derives its own root from where it is served, and a copy of `auth.html`
> is kept at `/auth` so links in older confirmation emails still resolve.
> **Update Supabase → Authentication → URL Configuration** to point Site URL at
> `.../Football-Data-Labeling-Website/tagger/` so new confirmation emails land on
> the tagging app rather than the client site.

## Repository layout
```
index.html, shared.*, cloud-sync.js, auth.*   the labeling app (deployed to /tagger)
Stats/, Player-Lists/                          its sub-pages    (deployed to /tagger/…)
client/                                        the client site  (deployed to /)
  index.html      landing page
  app.html        the channel app — matches, data, players
  login.html      client sign-in
  assets/         site.css, app.css, supa.js, app.js
supabase/migrations/                           schema, in order
```
Nothing moves inside the repo — the relocation happens only in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), so opening
`index.html` from disk still works exactly as before.

## The client site
A **channel is a club**. A club signs in and sees only its own matches, and only the
ones an analyst has marked published.

The rail has three sections, and About Hoang Nam at its foot leading back to the
public site.

- **Home** — the fixture list with results, straight from `public.matches`.
  A fixture opens on **Overview** (head-to-head and the shot breakdown); the ▶
  on the end of a row opens **Analysis**, which is the whole Stats page mounted
  inside this site — three views, both sides, the six categories, the maps and
  the XLSX / CSV / PDF exports.

  It is the same file the tagging app runs, not a copy: `Stats/stats-view.js`
  is mounted by `Stats/index.html` and by the client app alike. What differs is
  only how it is fed. The tagging app hands it the live match; the client hands
  it one **published report** — so a club never needs read access to
  `public.events`, never signs in to the tagging app, and never waits for
  eighteen hundred rows to page in.
- **Channel** — the channels this account is in. Creating one makes you its
  admin: you invite people by email, set what each of them is (admin / analyst /
  viewer) and remove them again. One channel is one club. A channel carries no
  competition or stage: a club plays in several over a season, so those live on
  the match, and the fixture list reads each match's own.

  The first channel is the awkward one — creating one from the site needs a
  session, because whoever creates it becomes its admin, and the SQL Editor has
  none. [`supabase/seed/saint_lucia_channel.sql`](supabase/seed/saint_lucia_channel.sql)
  is that first channel done from SQL: it names the admin, points the four
  tagged qualifiers at it, publishes them, and writes each one's first report so
  the Analysis tab works without four trips through Submit Analysis. Run it once,
  after 0014–0016. Running it again changes nothing.
- **Data** — team stats, recent results and the last starting XI the analyst
  entered, then every published match added up and the per-match table.

**Players** (who scored and who created) no longer has a rail entry, but the view
is unchanged and still opens at `#/players`.

`client/assets/supa.js` is the only source of channel data. There is no sample
channel to fall back on: signed out, or signed in without a membership, the app
says which of the two it is rather than showing somebody else's numbers.

**Before a real client logs in, run
[`supabase/migrations/0013_client_channels.sql`](supabase/migrations/0013_client_channels.sql).**
It adds `clubs`, `club_members` and `staff`, plus `published`/`club_id` on matches
and a `match_stats` view. Part A is additive and safe. Part B — the half that
actually restricts who reads what — is commented out on purpose: today's policies
are `to authenticated`, meaning **any signed-in account can read every match in the
database**. Put your analysts in `public.staff` first, then uncomment it.

**For the Channel section, also run
[`supabase/migrations/0014_channel_admin.sql`](supabase/migrations/0014_channel_admin.sql).**
0013 made a channel something only staff could hand out; 0014 makes it something a
signed-in person can create. It adds `club_invites`, the trigger that makes the
creator an admin, the guard that stops a channel losing its last one, and
`claim_club_invites()` — the function that turns an invite into a membership the
first time that email signs in (nothing is emailed; you send the link yourself).
It replaces the write policies on `clubs` and `club_members` only, and leaves
`matches`, `events`, `teams` and `players` exactly as they were, so the tagging
app is untouched. Until it is run, the Channel section says which file to run
rather than failing silently.

**And run [`supabase/migrations/0015_match_stats_event_names.sql`](supabase/migrations/0015_match_stats_event_names.sql).**
0013 built `match_stats` on patterns like `event_name like '#goal%'`, believing
an event is stored under the name you type, hash and all. It is not — the hash
is only how an event is addressed while typing a chain, and what is stored is
the bare dictionary name (`goal`, `pass success`). So every filter in the view
matched nothing and every column came back 0, which is why the head-to-head
bars, the shot breakdown and the Data totals were empty on a real channel while
the seeded sample looked fine. 0015 is a `create or replace` with the same
columns in the same order.

**And [`supabase/migrations/0016_match_reports.sql`](supabase/migrations/0016_match_reports.sql)**,
which is what **Submit Analysis** writes into. Realtime stops at the tagging
app: when an analyst has finished with a match they pick a channel under
**▾ Other → ⇪ Submit Analysis**, and the match is frozen as it stands into one
`match_reports` row — the events, the line-ups with their substitution history,
and the half-to-video mapping. That is the row the client site reads. Publishing
again adds a version rather than overwriting one, so there is a record of what a
club was shown and when, and the dialog refuses to look ready while the database
is still behind the tab doing the tagging.

**[`supabase/migrations/0017_public_channels.sql`](supabase/migrations/0017_public_channels.sql)
is optional, and it is the one that gives data away.** It adds `clubs.is_public`,
off for every channel until an admin of that channel turns it on under **Channel →
Who can read this channel**. On, it means *public*, not unlisted: the anon key is
committed here and served in the JavaScript of a static site, so anyone can query
this database with it. What becomes readable is the whole signed-off report —
every tagged event with its pitch coordinates, the line-ups, and the shirt numbers
**and names** of the players, on both teams. Closing it again stops new readers; it
does not take back what was already read.

The trap it also closes: `match_stats` is a *view*, and a view in Postgres runs with
its owner's privileges, so row-level security does not reach it. Anonymous access is
revoked there and given a `public_match_stats` that does the filtering itself. The
raw event stream is never opened to anyone.

### The contact form on the landing page
**Email us** is a `mailto:`, and a `mailto:` opens nothing at all on a machine with
no mail client registered — a club on webmail, a locked-down work laptop — with no
way for the page to detect it. So the landing page also carries a **form**, which
posts to the Cloudflare Worker: the enquiry is saved to `public.leads` and then
emailed on, with `reply_to` set to the sender so hitting Reply answers the club. The
`mailto:` and the copy-the-address button stay exactly where they were, as the path
for a browser running no JavaScript.

Needs [`supabase/migrations/0019_leads.sql`](supabase/migrations/0019_leads.sql) and
the secrets in [`worker/README.md`](worker/README.md#the-contact-form-contact).
`public.leads` has **no policy for `anon` and no INSERT policy at all** — for the
same reason 0017 warns about, the browser must not be able to write here, so the
Worker does it with the service role key. Full design:
[`docs/contact-form-design.md`](docs/contact-form-design.md).

## How the labeling app runs
The whole app is the static file [`index.html`](index.html) — no backend required.
It is hosted for free on **GitHub Pages** and served over HTTPS, so anyone with the
link can use it in a modern browser (Chrome/Edge recommended).

## Accounts (sign in / sign up)
Every page of the site is behind an account. Opening any of them without one lands on
[`auth.html`](auth.html) — served by GitHub Pages at the extension-less **`/auth`** — which
offers **Sign in** (email + password) and **Sign up** (full name, email, password, confirm
password). After signing in you land on the main tagging tab, where **▾ Other** — the first
button on the header bar — drops down the account you are signed in as and **⎋ Sign out**.
Sign-in is by email and password only; there is no third-party provider.

A new password must be **at least 6 characters, with one capital letter and one special
character** — stated under the field, and checked before Supabase is asked. Signing in is
deliberately *not* held to that rule, so an account made before it tightened can still get
in.

**You stay signed in.** The session lives in `localStorage`, so closing the tab, quitting
the browser or turning the machine off changes nothing — the next visit goes straight to
the tagging tab without showing the sign-in screen. The access token expiring does not log
you out either: the gate does not look at expiry, and the client renews it on load. Only
**⎋ Sign out** ends a session, and it ends it in every open tab at once. Signing out leaves
all tagged data (events, lineups, match meta) untouched.

**The browser keeps your password, not us.** Sign in and sign up are **two separate
`<form>` elements**, and that is load-bearing rather than cosmetic: a password manager walks
`form.elements` and never looks at what is on screen, so while both lived in one form the
new-password and confirm boxes were part of it even while hidden — and a form holding a
`current-password` *and* a `new-password` reads as a sign-up or change-password form, which
Chrome will not fill a saved login into. Split, the sign-in form contains a `username` and a
`current-password` and nothing else, which is unmistakable. On success the page also calls
`navigator.credentials.store()` outright, so Chrome and Edge raise their *"Save password?"*
prompt there and then rather than inferring it from the redirect that follows; Firefox and
Safari have no such API and fall back to the tokens, which they read the same way. Nothing
here touches our storage — the site never keeps a password.

The other half is timing, and it is the part that actually bit. A browser decides whether
to offer to save from what it sees between the form being submitted and the page going
away; measured on the real page that gap was **22ms**, so no prompt ever appeared and
nothing was ever saved. A successful sign-in now says *Signed in ✓* and holds the page for
`SETTLE_MS` before leaving, with the form still standing and its values intact — the state
every password manager reads as a login that worked. Arriving with a session already in
hand skips the wait; a wrong password never reaches it.

Belt and braces, the **email address** (never the password) is kept in `localStorage` and
put back on the sign-in form after a sign-out — but only if the browser did not fill the
form itself, so its own autofill always wins. A password in `localStorage` would be
readable by any script on the origin, which is why keeping one stays the browser's job.

The accounts live in **Supabase Auth**, the project the app already syncs to, so there is
still no backend of our own. [`auth.js`](auth.js) is the gate: every page loads it, and it
decides — synchronously, from the session supabase-js keeps in `localStorage` — whether to
show the page or replace it with the sign-in screen. The page you were turned away from is
remembered, so a shared `…/#match=12345` link still opens that match once you are in.

It is a UX gate, not a security boundary: the site is static, so the files are public
either way. What actually protects the data is Supabase **Row-Level Security** (every
policy is `to authenticated`) — see [`supabase/migrations/`](supabase/migrations/).

### Supabase setup for accounts
Email + password works as soon as the project exists. The rest is dashboard-only:

1. **Authentication → URL Configuration** — the one that actually bites.
   - *Site URL:* `https://hoangnam25012004.github.io/Football-Data-Labeling-Website/`
   - *Redirect URLs:* add `https://hoangnam25012004.github.io/Football-Data-Labeling-Website/**`
     (and `http://localhost:8765/**` if you develop locally).

   There are two sign-up screens now, and they point their confirmation links at different
   pages: the tagging app's `/auth` sends `emailRedirectTo` back to itself, and the client
   site's `/login.html` back to itself. The wildcard above covers both — narrow it to exact
   URLs and you have to list both. **Supabase honours `emailRedirectTo` only if it
   matches Redirect URLs** — otherwise it silently falls back to the Site URL. Leave Site URL
   at its factory default and the confirmation email lands the user on
   `http://localhost:3000/#access_token=…`: *This site can't be reached*, on a confirmation
   that actually succeeded. Nothing in this repo ever mentions `localhost:3000`; if you see
   it, these two fields are why.

   [`auth.js`](auth.js) softens the blow — tokens that land on the app instead of `/auth` are
   handed over to it rather than dropped — but the fields still need to be right, or every
   confirmation link goes to whatever the Site URL says.
2. **Confirmation emails.** The project currently has *Confirm email* **on**, so a new
   account cannot be used until the emailed link is clicked, and the sign-up screen says so.
   For instant access turn it off in **Authentication → Providers → Email**. (Supabase's
   built-in mailer is rate-limited to a handful of messages per hour — set up SMTP before
   inviting a squad's worth of people.)
3. **Session length.** *Authentication → Sessions* is left at Supabase's default — no
   inactivity timeout and no time-box — which is what keeps people signed in until they
   choose to sign out. Setting either of those would start expiring sessions on its own.

Anonymous sign-in stays enabled — [`cloud-sync.js`](cloud-sync.js) falls back to it only
when there is no account session, and an anonymous session never opens the gate.

## Deployment (CI/CD)
Every push to the `main` branch triggers the workflow in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which publishes the
site to GitHub Pages automatically. You can also trigger it manually from the
repository's **Actions** tab.

### One-time setup
In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

## Local development
Just open `index.html` in your browser. For the "auto-save to file" feature (File System
Access API), serve it over `http://localhost` (e.g. `python -m http.server`) in Chrome/Edge.
The sign-in gate works the same locally, except that only GitHub Pages resolves the pretty
`/auth`, so off the live site it opens `auth.html` by name.

## Tests
```bash
node tests/run.js
```
No dependencies and no install step: the suite lifts the functions it exercises straight
out of the `<script>` in [`index.html`](index.html) (and in [`Stats/index.html`](Stats/index.html)),
plus [`shared.js`](shared.js) whole, and runs them in a `vm` sandbox against stubs for the
DOM/video/cloud, so it always tests the shipped code. Covered today: the substitution →
formation-history flow (single/double/triple swaps in one entry, pairs typed back-to-front,
impossible pairs, dots and 2nd-half mirroring, re-tagging, deleting, and substitutions tagged
out of order); the Stats General tab (which swaps collapse into one x2 / x3 timeline marker,
and the bench listed under each formation); the Stats Distribution tab (the take-ons &
step-ins map, the row it shares with the cross map, and who the touch map lists per half);
the sign-in gate in [`auth.js`](auth.js) (who gets in, an anonymous session never counting
as an account, a session past its expiry still getting in, the page you were turned away
from coming back, `next` refusing to be an open redirect, the password rules, and the
sign-in screen carrying what a password manager needs); and what Stats and Player lists do
with no match open — the stores they read are shared by every match this browser has ever
opened, so a stored squad counts only when its stamp names the match that is open, and the
main tab keeps both buttons disabled until there is one; and the macro hotkeys (a macro
tagging exactly what its long form tags, the ball-carrier and dot rules coming out the same,
an event hotkey always winning over a macro that claims it, a macro left pointing at a
deleted event being refused rather than half-applied, and the two tables staying separate);
and what a stored row is allowed to carry — every event naming the player who did it,
`#pass success`/`#cross success` naming the receiver whose dot fills `rx,ry`, `#pass fail`/
`#cross fail` keeping their trailing extra dot, only a pass, a cross or a substitution being
allowed to take the number that follows it, and the events table offering no inline cell
editor at all, so every correction goes back through ✎ Edit and the rules it re-runs; and
the formation board —
where an unknown position parks, that a squad added at once stacks there, and that a
position cell spaces 1 to 4 dots evenly without pushing any of them into a neighbour, that
the Formation modal tidies every period of the team on screen and leaves the other alone,
and that its copy of the arranger has not drifted from the one in `shared.js`; and the goal
spot — that a shot on target is not written until the ball has been placed, that every other
event still tags in one Enter, that the spot lands on the shot rows and nothing else, that a
click outside the frame is pulled back onto it, and that an event without one never names the
`goal_x`/`goal_y` columns (which is what keeps un-migrated databases syncing); and the goal
mouth on the shooting maps — where a marker lands for a given spot, that only placed shots
get one, and that the report numbers a goal marker exactly as its pitch marker and its Event
List row.
`tests/` is not part of the deployed site.

## Real-time cloud sync (Supabase)
Tagged events can be saved to a shared Postgres database and synced live between everyone
viewing the same match (video stays local — only event metadata is stored).

**One-time Supabase setup:**
1. Create a free project at [supabase.com](https://supabase.com).
2. Run the schema: paste each file in [`supabase/migrations/`](supabase/migrations/) into the
   SQL Editor **in order** (`0001` → `0008`), or run `supabase db push`. They add, in turn:
   matches + events, match codes, the shared `event_types` dictionary, realtime, lineups,
   the `event_types.name` → `event_name` rename, and the `teams` / `players` tables.
3. Auth → Providers → enable **Allow anonymous sign-ins**.
4. (Optional, for zero-friction sharing) put your project **URL** and **anon key** into
   `CONFIG` at the top of [`cloud-sync.js`](cloud-sync.js). The anon key is public and safe
   to commit — access is protected by Row-Level Security.

**Recent matches.** Under the Match ID box, **⚽ Match** lists the last 5 matches *this
account* opened — click one to go straight back in. It is kept in `localStorage` under the
signed-in user's id, so two people sharing a browser never see each other's, and signing
out does not wipe it. Being browser-local, it does not follow the account to another
machine; that would need a visits table in the database.

**Using it:**
- Click **☁ Cloud** → Connect (enter URL + anon key if not baked into `CONFIG`).
- **New shared match** → copy the link and send it to collaborators.
- Anyone who opens the link sees each other's tags appear live.

See [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) for the schema
(Matches + Events with a JSONB `attributes` column for unlimited per-event metrics),
indexes, RLS, and the realtime publication.

## Notes
- Without cloud sync, events and the event/hotkey list stay in the browser (localStorage)
  and can be backed up to `pitchtagger_events.json`.
- **⚙ Event** holds two tables. *Event types* is one hotkey per event. *Macro* is one hotkey
  for a whole run of events: press **＋ Add Macro**, type the events the way you type them in
  the entry box (`qq*s`), then give the macro its own code (`qs`) — from then on `1qs2` tags
  what `1qq*s2` tags. An event's own hotkey always wins, so a macro can never shadow one; a
  clashing code is shown in red. Macros are stored per browser (`pitchtagger.macros.v1`) and,
  unlike the event dictionary, are **not** shared through the cloud.
- On the **Player lists** formation board, a player whose position isn't known yet lands on
  the empty staging square beside the goalkeeper — next to LB for the home side, next to RB
  for the away side. A whole squad added at once stacks on that one spot on purpose; it is
  where you sort them out from. Drag a dot into a position cell and the cell shares itself
  out evenly: one sits in the middle, two at 1/3 and 2/3, three at 1/4·1/2·3/4, and so on.
  The main tab's **⛨ Formation** modal spaces its dots by the same rule — opening it tidies
  that team's whole timeline, the starting XI and every substitution snapshot, so scrubbing
  the video shows an even board at any moment. The other team waits until it is opened.
- A **#shot on target** or **#goal** is stored with the spot the ball crossed the line at.
  Press Enter on the entry and the formation panel turns into a goal mouth: drag the ball
  onto the spot and press Enter again to save it, or Esc to go back (the entry and its dots
  are kept either way). The spot is normalised to the mouth — `goal_x` 0 = left post → 100 =
  right post, `goal_y` 0 = crossbar → 100 = the goal line — and clamped to the frame.
  **Run [`supabase/migrations/0012_event_goal_xy.sql`](supabase/migrations/0012_event_goal_xy.sql)
  before tagging shots against a cloud match**: it adds the two columns those coordinates
  go into. Until it is run, ordinary events still sync (they never name the columns), but a
  placed shot fails to upsert.
- Those spots are drawn on **both shooting maps** — the Stats tab's and the one in the match
  report — so each reads as "struck from here, ended up there". Markers carry the same label
  and colour as the pitch map beside them: the shirt number in the Stats tab, the shot's
  number (which is its row in the Event List) in the report. Only shots that were given a
  spot appear; off target, blocked and missed never cross the line.
- The Stats shooting map is **one vertical map for the whole match**: the pitch stood on end
  with both halves normalised to attack up, cropped to the attacking half (and stretched back
  if a shot came from deeper), with the goal standing on the goal line at the top of the same
  drawing. There is no 1st/2nd toggle — a shot is a shot whichever end the team was kicking to.
- Every tagged event names the player who did it (`2f`, not `f`), so every stored row has
  `x,y`. A **successful** pass/cross also names the receiver (`1s2`) — that player's dot is
  what fills `rx,ry`. A **failed** one reaches nobody, so it names no receiver and takes one
  extra dot where the ball ended up (`7ss` + 2 dots), which fills `rx,ry` instead.
- Videos are never uploaded — for a scalable multi-user video pipeline use a CDN
  (Cloudflare Stream / R2) as described in the architecture plan.
