# Football Data Labeling Website

A single-page web app for tagging football match events from video — events + hotkeys,
player/receiver coordinates on a pitch, per-player and team stats, pass-distribution
matrices, half-by-half timelines, and XLSX/CSV export.

**Live site:** https://hoangnam25012004.github.io/Football-Data-Labeling-Website/

## How it runs
The whole app is the static file [`index.html`](index.html) — no backend required.
It is hosted for free on **GitHub Pages** and served over HTTPS, so anyone with the
link can use it in a modern browser (Chrome/Edge recommended).

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
out of order); and the Stats General tab (which swaps collapse into one x2 / x3 timeline
marker, and the bench listed under each formation). `tests/` is not part of the deployed site.

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
- Videos are never uploaded — for a scalable multi-user video pipeline use a CDN
  (Cloudflare Stream / R2) as described in the architecture plan.
