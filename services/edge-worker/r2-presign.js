/* ===========================================================================
   Cloudflare Worker — presign a direct-to-R2 upload URL.

   The browser POSTs { matchId, filename, contentType }; this returns
   { uploadUrl, publicUrl }. The browser then PUTs the file straight to R2
   using uploadUrl (bytes never pass through this Worker), and saves publicUrl
   into matches.video_url.

   Secrets (wrangler secret put):  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
   Vars (wrangler.toml):           R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_BASE, ALLOW_ORIGIN
   Dependency:                     aws4fetch  (npm i aws4fetch)
=========================================================================== */
import { AwsClient } from 'aws4fetch';

const corsHeaders = (allow) => ({
  'Access-Control-Allow-Origin': allow,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
});

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });

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
    const { matchId, filename } = body || {};
    if (!matchId || !filename) return json({ error: 'matchId and filename required' }, 400, headers);

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
