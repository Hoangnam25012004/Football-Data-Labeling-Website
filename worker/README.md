# Video storage on Cloudflare R2 (optional)

The app can play a match video from a **hosted URL** (`matches.video_url`). You have three ways
to give a match a video — you can mix and match per match:

| Mode | How | Shared? | Needs this Worker? |
|------|-----|---------|--------------------|
| **Local file** | 🎞 Video → *Choose a local video file* | No (this browser only) | No |
| **Paste a URL** | 🎞 Video → paste a public `.mp4`/`.webm` link → *Use* | Yes (saved to the match) | No |
| **Upload to R2** | 🎞 Video → *Choose a video & upload to R2* | Yes | **Yes** (this Worker) |

If you only ever paste an already-hosted URL, you don't need any of this — skip to *Paste a URL*.
This Worker only adds the one-click **upload** button.

Egress from R2 is free, storage is cheap, and the first **10 GB stored at any moment** is free.

---

## One-time R2 setup

1. **Create a bucket** — Cloudflare dashboard → R2 → *Create bucket* (e.g. `football-videos`).
2. **Make it publicly readable** so the `<video>` tag can stream it:
   - Bucket → *Settings* → **Public access** → enable the **r2.dev** dev URL (or connect a custom domain).
   - Copy that base, e.g. `https://pub-xxxxxxxx.r2.dev` → this is `R2_PUBLIC_BASE`.
3. **Bucket CORS** (needed for the browser PUT + smooth seeking). Bucket → *Settings* → **CORS policy**:
   ```json
   [
     {
       "AllowedOrigins": ["https://hoangnam25012004.github.io"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **Create an R2 API token** — R2 → *Manage R2 API Tokens* → *Create API token* → **Object Read & Write**
   for this bucket. Note the **Access Key ID**, **Secret Access Key**, and your **Account ID**.

## Deploy the Worker

```bash
cd worker
npm install
# fill in the [vars] in wrangler.toml (account id, bucket, public base, allowed origin)
npx wrangler login
npx wrangler secret put R2_ACCESS_KEY_ID       # paste the Access Key ID
npx wrangler secret put R2_SECRET_ACCESS_KEY   # paste the Secret Access Key
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g. `https://r2-presign.<you>.workers.dev`.

## Point the app at the Worker

In [`../cloud-sync.js`](../cloud-sync.js), fill in `CONFIG.R2`:

```js
R2: {
  workerUrl:  'https://r2-presign.<you>.workers.dev',
  publicBase: 'https://pub-xxxxxxxx.r2.dev'   // same as R2_PUBLIC_BASE
}
```

Commit & push. Now the **⬆ upload to R2** button appears in the 🎞 Video dialog once you're in a
shared match (Cloud → open/create a match).

---

## How it flows

```
Browser  --POST {matchId,filename}-->  Worker  --presign-->  returns uploadUrl + publicUrl
Browser  --PUT file bytes----------->  R2 bucket           (key: matches/<matchId>/<ts>-<file>)
Browser  --save publicUrl---------->  matches.video_url    (only the link, no bytes)
Anyone opening the match  -->  reads video_url  -->  <video> streams from R2 (CDN, range/seek)
```

## Housekeeping (staying under 10 GB free)

- Storage is billed on **what you hold at any moment**, not cumulative uploads. Delete an old
  match's object and the space frees immediately — replacing old with new keeps you at $0.
- Delete via the dashboard (R2 → bucket → the `matches/<oldMatchId>/…` object) or `wrangler r2 object delete`.
- When you delete a video, also clear/replace that match's `video_url` (or delete the match) so it
  doesn't show a dead link.
