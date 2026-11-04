/* ===========================================================================
   Cloudflare Worker — the entry point, and nothing else.

   One Worker now answers two unrelated things, so this file exists only to
   say which is which:

     POST /contact   the landing page's contact form   -> contact.js
     POST /  (any other path)   presign an R2 upload   -> r2-presign.js

   THE DEFAULT IS NOT A TIDINESS DECISION. cloud-sync.js posts to the bare
   Worker URL with no path at all:

       const resp = await fetch(R2.workerUrl, { ... });     // cloud-sync.js

   so the root has to go on meaning "presign" for every copy of the tagging
   app already in somebody's browser. Anything unrecognised falls through to
   presign for the same reason — a path this router has never heard of is far
   more likely to be an old client than a new feature.

   r2-presign.js is imported unchanged and still handles its own CORS and
   method checks. Adding the contact form did not edit a line of it, which is
   the point: video upload cannot break over a change it has no part in.

   wrangler.toml therefore has `main = "index.js"` — the entry FILE moved, the
   Worker `name` did not, so the deployed URL is exactly what it was.
=========================================================================== */
import presign from './r2-presign.js';
import contact from './contact.js';

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/contact' || pathname === '/contact/') return contact.fetch(request, env, ctx);
    return presign.fetch(request, env, ctx);
  },
};
