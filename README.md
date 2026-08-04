# Football Data Labeling Website

A single-page web app for tagging football match events from video — events + hotkeys,
player/receiver coordinates on a pitch, per-player and team stats, pass-distribution
matrices, half-by-half timelines, and XLSX/CSV export.

**Live site:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/

**Sign in:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/auth

## How it runs
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

   Sign-up sends `emailRedirectTo` pointing at `/auth`, but **Supabase honours it only if it
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
`#cross fail` keeping their trailing extra dot, and the double-click event cell refusing to
rename a row into a ball-moving event it has no receiver for; and the formation board —
where an unknown position parks, that a squad added at once stacks there, and that a
position cell spaces 1 to 4 dots evenly without pushing any of them into a neighbour, that
the Formation modal tidies every period of the team on screen and leaves the other alone,
and that its copy of the arranger has not drifted from the one in `shared.js`.
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
- Every tagged event names the player who did it (`2f`, not `f`), so every stored row has
  `x,y`. A **successful** pass/cross also names the receiver (`1s2`) — that player's dot is
  what fills `rx,ry`. A **failed** one reaches nobody, so it names no receiver and takes one
  extra dot where the ball ended up (`7ss` + 2 dots), which fills `rx,ry` instead.
- Videos are never uploaded — for a scalable multi-user video pipeline use a CDN
  (Cloudflare Stream / R2) as described in the architecture plan.
