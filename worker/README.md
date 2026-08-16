# The Worker

One Worker, two unrelated jobs, split by path in [`index.js`](index.js):

| Path | What it does | Set up in |
|------|--------------|-----------|
| `/` (and anything else) | presigns a direct-to-R2 video upload | this page, below |
| `/contact` | takes the landing page's contact form | [The contact form](#the-contact-form-contact) |

The default is not tidiness: `cloud-sync.js` posts to the bare Worker URL with no path, so the
root has to go on meaning *presign* for every copy of the tagging app already in a browser.
`name = "r2-presign"` in `wrangler.toml` **is** the deployed URL — don't rename it.

---

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

---

# The contact form (`/contact`)

The landing page's **Email us** button is a `mailto:`, which opens nothing at all on a machine
with no mail client registered — and the page cannot detect that. So the page also carries a
form, and the form posts here. See [`../docs/contact-form-design.md`](../docs/contact-form-design.md)
for the full design.

```
Browser --POST /contact--> Worker --INSERT--> public.leads   (service role key)
                                  --POST----> api.resend.com --> your inbox
```

The browser never touches Supabase for this. `public.leads` has **no policy for `anon` and no
INSERT policy at all** (`../supabase/migrations/0019_leads.sql`) — the anon key is committed to
this repo and served in the page, so a writable table there would belong to the open internet.
The Worker holds the service role key, which bypasses row-level security.

## One-time setup

1. **Run the migration** — `supabase/migrations/0019_leads.sql`, via `supabase db push` or the
   SQL Editor.

2. **Get a Resend API key** — [resend.com](https://resend.com) → *API Keys*. The free tier is
   enough (100 mails/day).

   > ⚠ Without a verified domain, Resend's shared sender (`onboarding@resend.dev`) may only
   > deliver **to the address that owns the Resend account**. That is exactly what `CONTACT_TO`
   > is, so notifications work straight away — but you cannot send a confirmation copy to the
   > person who filled the form until you verify a domain and set `RESEND_FROM` to your own
   > address.

3. **Set the secrets:**
   ```bash
   cd worker
   npx wrangler secret put SUPABASE_URL          # https://xtzmtdcohoixoxqusyyz.supabase.co
   npx wrangler secret put SUPABASE_SERVICE_KEY  # Supabase → Settings → API → service_role
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put IP_SALT               # any long random string
   ```

   **`SUPABASE_SERVICE_KEY` is the `service_role` key, not the anon key.** It bypasses row-level
   security entirely. It belongs in `wrangler secret` and nowhere else — never in
   `wrangler.toml`, never in a page.

4. **Rate limiting (optional but recommended):**
   ```bash
   npx wrangler kv namespace create CONTACT_KV
   ```
   Paste the id it prints into the commented-out `[[kv_namespaces]]` block in `wrangler.toml` and
   uncomment it. Without the binding the limits are simply not applied — which is what lets
   `wrangler dev` run with no setup at all.

   With it: 5 messages per hour per IP, and 80 per day overall. Over the daily cap a lead is
   still **saved**; only the mail stops.

5. **Deploy:** `npx wrangler deploy`

## Checking it

```bash
npx wrangler dev
# the contact form
curl -X POST localhost:8787/contact -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@club.com","club":"SLU","message":"hello","elapsed":9000}'
# and the R2 path still answers as it always did
curl -X POST localhost:8787/ -H 'content-type: application/json' \
  -d '{"matchId":"m1","filename":"x.mp4"}'
```

Reading what came in:

```sql
select created_at, name, club, role, country, email, status, email_sent, message
from public.leads order by created_at desc;
```

`email_sent = false` with a reason in `email_error` means the enquiry arrived but the
notification did not — the lead is saved first for exactly this case.
