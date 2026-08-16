/* ===========================================================================
   Cloudflare Worker — the landing page's contact form.

   POST /contact  { name, email, club, role, country, message, videoUrl,
                    website, elapsed }
     -> saves a row in public.leads
     -> emails CONTACT_TO about it, with reply_to set to the enquirer
     -> { ok: true }

   WHY THE BROWSER DOES NOT WRITE TO SUPABASE DIRECTLY
   The anon key is committed to this repository and served in the JavaScript
   of a static site, so an insert policy for `anon` on public.leads would hand
   a writable table to the open internet, and a select policy would publish
   every club that ever wrote to us. So public.leads has neither (0019), and
   this Worker — holding the SERVICE ROLE key, which bypasses row-level
   security — is the only door.

   ORDER MATTERS: the row is saved BEFORE the mail is sent. A lead is worth
   more than the notification about it. A failed insert is an error the
   visitor is told about (they still have the address on the page); a failed
   send is not — the enquiry is already safe, and the reason is written to
   leads.email_error instead.

   Secrets (wrangler secret put):
     SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, IP_SALT
   Vars (wrangler.toml):
     CONTACT_TO, RESEND_FROM, ALLOW_ORIGIN
   Binding (optional):
     CONTACT_KV — rate limiting. Absent, the limits are simply not applied,
     so `wrangler dev` runs without any KV setup.
=========================================================================== */

const corsHeaders = (allow) => ({
  'Access-Control-Allow-Origin': allow,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
});

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });

/* Hard caps, applied on this side as well as in the page. The page's are a
   courtesy to the person typing; these are the ones that decide. */
const MAX = { name: 120, email: 200, club: 120, role: 120, country: 120, videoUrl: 500, message: 4000 };

/* The same test the client site applies to an invite address — one shape of
   "is this an email" across the project, not two. See client/assets/supa.js. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Nobody reads seven fields and writes a message in under three seconds. */
const MIN_FILL_MS = 3000;

const PER_IP_HOUR = 5;
/* Below Resend's 100/day on the free tier, so the cap that bites is ours and
   is visible in leads.email_error, rather than theirs and invisible. */
const PER_DAY = 80;

const field = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/* A hash, never the address. Rate limiting and spotting a flood both work on
   "is this the same caller as before", which a hash answers; the address
   itself is personal data we have no use for. */
async function ipHash(ip, salt) {
  const buf = new TextEncoder().encode(String(ip || '') + '|' + String(salt || ''));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* KV is eventually consistent, so these counts are approximate — two requests
   landing together can both read the same number. That is fine for what this
   is: a brake on floods, not an accounting ledger. */
async function rateLimit(env, hash) {
  const kv = env.CONTACT_KV;
  if (!kv) return { allowed: true, mayMail: true };

  const ipKey = 'rl:' + hash;
  const seen = +(await kv.get(ipKey)) || 0;
  if (seen >= PER_IP_HOUR) return { allowed: false, mayMail: false };
  await kv.put(ipKey, String(seen + 1), { expirationTtl: 3600 });

  const dayKey = 'rl:day:' + new Date().toISOString().slice(0, 10);
  const today = +(await kv.get(dayKey)) || 0;
  await kv.put(dayKey, String(today + 1), { expirationTtl: 172800 });

  /* Over the daily cap the lead is still saved — it is only the mail that
     stops. Dropping the enquiry to protect a mail quota would be backwards. */
  return { allowed: true, mayMail: today < PER_DAY };
}

async function saveLead(env, row) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const r = await fetch(base + '/rest/v1/leads', {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error('leads insert refused: ' + r.status);
  const rows = await r.json().catch(() => null);
  return (rows && rows[0]) || null;
}

/* Best effort, and deliberately silent on failure: this runs AFTER the
   visitor has been told their message arrived, and it had. */
async function markMailed(env, id, sent, error) {
  if (!id) return;
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  await fetch(base + '/rest/v1/leads?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email_sent: !!sent, email_error: error || null }),
  }).catch(() => {});
}

async function notify(env, lead) {
  const lines = [
    'Name:     ' + lead.name,
    'Email:    ' + lead.email,
    'Club:     ' + lead.club,
    'Role:     ' + (lead.role || '—'),
    'Country:  ' + (lead.country || '—'),
    'Video:    ' + (lead.video_url || '—'),
    '',
    lead.message,
    '',
    '— sent from the contact form on the landing page. Reply to this mail and it goes to them.',
  ];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: env.CONTACT_TO,
      /* The point of the whole notification: hitting Reply in the inbox
         answers the club, not this Worker. */
      reply_to: lead.email,
      subject: 'New enquiry — ' + lead.club + ' (' + lead.name + ')',
      text: lines.join('\n'),
    }),
  });
  if (!r.ok) throw new Error('resend ' + r.status);
}

export default {
  async fetch(request, env) {
    const allow = env.ALLOW_ORIGIN || '*';
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(allow);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, headers);
    if (allow !== '*' && origin !== allow) return json({ error: 'forbidden origin' }, 403, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, headers); }
    body = body || {};

    /* ---------- the two traps, before anything is written or spent ----------
       Both answer with a plain success. Telling a bot which check caught it is
       telling it what to change, and there is no person on the other end of
       either branch to mislead. */
    if (field(body.website, 200)) return json({ ok: true }, 200, headers);
    /* `elapsed` is measured entirely in the page — time since the form was
       rendered — rather than being a timestamp we compare against our own
       clock. A visitor whose device clock is days out is still a visitor. */
    const elapsed = Number(body.elapsed);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS)
      return json({ ok: true }, 200, headers);

    /* ---------- what they actually told us ---------- */
    const lead = {
      name: field(body.name, MAX.name),
      email: field(body.email, MAX.email).toLowerCase(),
      club: field(body.club, MAX.club),
      role: field(body.role, MAX.role) || null,
      country: field(body.country, MAX.country) || null,
      message: field(body.message, MAX.message),
      video_url: field(body.videoUrl, MAX.videoUrl) || null,
      source: 'landing',
      user_agent: String(request.headers.get('User-Agent') || '').slice(0, 300),
    };

    if (!lead.name) return json({ error: 'Please tell us your name.' }, 400, headers);
    if (!EMAIL.test(lead.email)) return json({ error: 'That email address does not look right.' }, 400, headers);
    if (!lead.club) return json({ error: 'Please tell us which club or academy you are with.' }, 400, headers);
    if (!lead.message) return json({ error: 'Please write us a message.' }, 400, headers);

    const hash = await ipHash(request.headers.get('CF-Connecting-IP'), env.IP_SALT);
    lead.ip_hash = hash;

    const limit = await rateLimit(env, hash);
    if (!limit.allowed)
      return json({ error: 'That is a few messages in a short time. Try again in an hour, or write to us directly.' }, 429, headers);

    /* ---------- save first ---------- */
    let saved;
    try {
      saved = await saveLead(env, lead);
    } catch {
      /* Whatever Postgres or the network said stays in the Worker's log. The
         visitor gets a sentence and, on the page, the address to fall back to. */
      return json({ error: 'We could not save that just now. Please email us directly instead.' }, 502, headers);
    }

    /* ---------- then tell someone ---------- */
    if (!limit.mayMail) {
      await markMailed(env, saved && saved.id, false, 'daily cap reached');
      return json({ ok: true }, 200, headers);
    }
    try {
      await notify(env, lead);
      await markMailed(env, saved && saved.id, true, null);
    } catch (e) {
      await markMailed(env, saved && saved.id, false, String((e && e.message) || e).slice(0, 300));
    }

    return json({ ok: true }, 200, headers);
  },
};
