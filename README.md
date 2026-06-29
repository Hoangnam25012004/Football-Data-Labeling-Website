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

## Notes
- Match events and the event/hotkey list are stored in the browser (localStorage) and can
  be backed up to `pitchtagger_events.json`.
- For a multi-user, cloud-stored version (shared database, video streaming), see the
  planned architecture: static frontend + Supabase (Postgres/Realtime/Auth) + a video CDN.
