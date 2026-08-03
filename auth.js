/* ===========================================================================
   auth.js — the sign-in gate shared by every page of the site.

   Accounts live in Supabase Auth (the same project the app already syncs to),
   so there is still no backend of our own. This file has two jobs:

     • On the app pages (index.html, Stats/, Player-Lists/) it is the GATE.
       Loading it is all a page has to do: it runs on load, and a page opened
       without an account is replaced by auth.html before anything renders.
     • On auth.html it is the toolbox — config, where the auth page lives, and
       where to send the user once they are in.

   Why the gate never creates a Supabase client: every app page already makes
   one (cloud-sync.js, and the sub-pages' own connect()), and a second client
   in the same page fights the first over refreshing the token. The session
   supabase-js persisted in localStorage says who is signed in, is there
   before the first paint, and costs no network round-trip — so the redirect
   happens with no flash of the app behind it. Signing in/out is the auth
   page's job, and that page makes the one real client.

   This is a UX gate, not a security boundary: the site is static, so the
   files are public either way. What actually protects the data is Supabase
   Row-Level Security (`to authenticated`) — see supabase/migrations/.
   =========================================================================== */
window.PTAuth = (function () {
  // Same PUBLIC values as cloud-sync.js (the anon key is safe to commit — RLS guards the rows).
  const CONFIG = {
    url: 'https://xtzmtdcohoixoxqusyyz.supabase.co',
    anonKey: 'sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa'
  };
  const LS_CFG = 'pitchtagger.cloud.cfg';   // what the Cloud modal saves — typed values win, exactly as in cloud-sync.js

  /* The site root is the folder auth.js is served from, so a root page and a sub-page
     (which loads it as ../auth.js) both resolve the same absolute URLs. */
  const ROOT = new URL('.', document.currentScript.src).href;
  /* GitHub Pages serves auth.html at the extension-less /auth — the address the site
     advertises. file:// and plain static servers (python -m http.server) need the real
     file name, so only the deployed host gets the pretty one. */
  const PRETTY = /(^|\.)github\.io$/i.test(location.hostname);
  const AUTH_URL = ROOT + (PRETTY ? 'auth' : 'auth.html');
  const TOKEN_KEY = /^sb-.+-auth-token(\.[0-9]+)?$/;

  function config() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_CFG)) || {}; } catch (e) {}
    return { url: saved.url || CONFIG.url, key: saved.key || CONFIG.anonKey };
  }

  /* ---------- the session supabase-js persisted ----------
     Stored under sb-<project-ref>-auth-token: plain JSON, or "base64-<base64url>",
     or split across .0/.1/… when it is too big for one entry. Anything we cannot
     read counts as "not signed in" — auth.html then re-checks with the SDK and, if
     there really is a session, sends the user straight back in. */
  function tokenKeys() {
    try { return Object.keys(localStorage).filter(k => TOKEN_KEY.test(k)); } catch (e) { return []; }
  }
  function fromB64(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function storedSession() {
    const parts = {};                       // base key -> { chunk index: text }
    for (const k of tokenKeys()) {
      const m = /^(sb-.+-auth-token)(?:\.([0-9]+))?$/.exec(k);
      (parts[m[1]] = parts[m[1]] || {})[m[2] == null ? -1 : +m[2]] = localStorage.getItem(k) || '';
    }
    for (const p of Object.values(parts)) {
      let raw = Object.keys(p).map(Number).sort((a, b) => a - b).map(i => p[i]).join('');
      try {
        if (raw.slice(0, 7) === 'base64-') raw = fromB64(raw.slice(7));
        const s = JSON.parse(raw);
        if (s && s.user) return s;
      } catch (e) { /* unreadable → not signed in */ }
    }
    return null;
  }

  /* An anonymous session is what cloud-sync.js creates on its own to reach the database.
     It is not an account, so it does not open the gate. */
  function user() {
    const s = storedSession();
    return (s && s.user && !s.user.is_anonymous) ? s.user : null;
  }
  function displayName(u) {
    u = u || user(); if (!u) return '';
    const m = u.user_metadata || {};
    return m.full_name || m.name || (u.email || '').split('@')[0] || 'Signed in';
  }

  /* ---------- where to go next ----------
     The gate remembers the page it turned away — including its hash, so a shared
     "…/#match=12345" link still lands on that match after signing in. Only paths
     inside this site are honoured (an absolute or protocol-relative `next` resolves
     outside ROOT and is dropped), and never the auth page itself. */
  function here() {
    return location.href.indexOf(ROOT) === 0 ? location.href.slice(ROOT.length) : '';
  }
  function nextUrl() {
    let n = '';
    try { n = new URLSearchParams(location.search).get('next') || ''; } catch (e) {}
    if (n) try {
      const u = new URL(n, ROOT).href;
      if (u.indexOf(ROOT) === 0 && !isAuthPath(new URL(u).pathname)) return u;
    } catch (e) {}
    return ROOT;
  }
  const isAuthPath = p => /(^|\/)auth(\.html)?$/.test(p);

  /* ---------- the gate ---------- */
  function requireLogin() {
    if (user()) { watchSignOut(); return true; }
    const from = here();
    location.replace(AUTH_URL + (from ? '?next=' + encodeURIComponent(from) : ''));
    return false;
  }
  /* Signing out in one tab signs out of all of them: localStorage fires `storage` in
     every OTHER tab on this origin, and the token key vanishing means the gate is shut. */
  let watching = false;
  function watchSignOut() {
    if (watching) return; watching = true;
    window.addEventListener('storage', e => {
      if (e.key && !TOKEN_KEY.test(e.key)) return;   // key === null when localStorage was cleared wholesale
      if (!user()) location.replace(AUTH_URL);
    });
  }

  async function signOut() {
    const c = config();
    try {
      if (window.supabase && c.url && c.key) await window.supabase.createClient(c.url, c.key).auth.signOut();
    } catch (e) { /* offline / revoked already — the local session still goes */ }
    for (const k of tokenKeys()) { try { localStorage.removeItem(k); } catch (e) {} }
    location.replace(AUTH_URL);
  }

  /* Every page that loads this file is gated, except the auth page itself. */
  if (!isAuthPath(location.pathname)) requireLogin();

  return { config, user, displayName, signOut, requireLogin, nextUrl, authUrl: () => AUTH_URL, appUrl: () => ROOT };
})();
