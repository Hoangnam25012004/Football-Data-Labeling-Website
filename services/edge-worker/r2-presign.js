/* ===========================================================================
   Cloudflare Worker — presign a direct-to-R2 upload URL.

   The browser POSTs { matchId, filename, contentType }; this returns
   { uploadUrl, publicUrl }. The browser then PUTs the file straight to R2
   using uploadUrl (bytes never pass through this Worker), and saves publicUrl
   into matches.video_url.

   WHO MAY ASK. The Origin check below is a browser courtesy and nothing
   more: curl sends any Origin it likes. So the request must also carry the
   caller's Supabase access token, and that token must belong to a signed-in,
   non-anonymous account listed in public.staff. Anything less is a stranger
   being handed an hour of free writes into a bucket that bills past 10 GB.
   Missing Supabase secrets fail CLOSED: nobody is signed for.

   Secrets (wrangler secret put):  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
                                   SUPABASE_URL, SUPABASE_SERVICE_KEY (already set for the enquiry form)
   Vars (wrangler.toml):           R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_BASE, ALLOW_ORIGIN
   Dependency:                     aws4fetch  (npm i aws4fetch)
=========================================================================== */
import { AwsClient } from 'aws4fetch';

const corsHeaders = (allow) => ({
  'Access-Control-Allow-Origin': allow,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Max-Age': '86400',
});

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* The staff user behind this request, or null. Two calls to Supabase: who
   the token belongs to (auth/v1/user rejects an expired or forged one), then
   whether that user is staff (service key, so RLS on public.staff is not in
   the way). Any failure along the way is a no. */
async function staffUser(request, env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) return null;
  try {
    const who = await fetch(base + '/auth/v1/user', { headers: { apikey: key, authorization: 'Bearer ' + m[1] } });
    if (!who.ok) return null;
    const user = await who.json();
    if (!user || !UUID.test(user.id || '') || user.is_anonymous) return null;
    const st = await fetch(base + '/rest/v1/staff?select=user_id&user_id=eq.' + user.id,
      { headers: { apikey: key, authorization: 'Bearer ' + key } });
    if (!st.ok) return null;
    const rows = await st.json();
    return Array.isArray(rows) && rows.length ? user : null;
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const allow = env.ALLOW_ORIGIN || '*';
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(allow);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, headers);
    if (allow !== '*' && origin !== allow) return json({ error: 'forbidden origin' }, 403, headers);

    if (!(await staffUser(request, env))) return json({ error: 'sign in with a staff account' }, 401, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, headers); }
    const { matchId, filename } = body || {};
    if (!matchId || !filename) return json({ error: 'matchId and filename required' }, 400, headers);
    // matchId becomes a path segment, so it has to be the uuid it claims to be
    if (!UUID.test(String(matchId))) return json({ error: 'matchId must be a uuid' }, 400, headers);

    // keep slashes as path separators; sanitise only the filename segment
    const safe = String(filename).replace(/[^\w.\-]+/g, '_').slice(-80);
    const key = `matches/${matchId}/${Date.now()}-${safe}`;

    const aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
    // presign a PUT valid for 1 hour (query-signed, unsigned payload)
    const signed = await aws.sign(`${endpoint}?X-Amz-Expires=3600`, { method: 'PUT', aws: { signQuery: true } });

    const base = (env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
    return json({ uploadUrl: signed.url, publicUrl: `${base}/${key}`, key }, 200, headers);
  },
};
