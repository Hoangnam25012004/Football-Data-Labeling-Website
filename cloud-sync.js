/* ===========================================================================
   Cloud real-time sync (Supabase) for the Football Data Labeling app.
   Loads after index.html's main script and talks to it via window.PT.
   Requires @supabase/supabase-js (loaded from CDN in index.html).

   To make the site work for everyone without each person entering keys,
   paste your project's PUBLIC values here (the anon key is safe to commit —
   it is protected by Row-Level Security):
=========================================================================== */
// Paste your project's PUBLIC values here so everyone can use the site without entering keys.
// Leave as '' to make users type their own. (Used only as a fallback — typed/saved values win.)
const CONFIG = {
  url: 'https://xtzmtdcohoixoxqusyyz.supabase.co',
  anonKey: 'sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa',
  // Optional: direct-to-R2 video upload. Deploy worker/r2-presign.js (see worker/README.md),
  // then paste its URL + your bucket's public base here. Leave workerUrl '' to hide the R2 button
  // (pasting a video URL manually still works without any of this).
  R2: { workerUrl: 'https://r2-presign.hoangnam25012004.workers.dev', publicBase: 'https://pub-9cdd291bf181425b9738328ada297691.r2.dev' }
};

(function () {
  const $ = (id) => document.getElementById(id);
  const LS = 'pitchtagger.cloud.cfg';
  let sb = null, channel = null, matchId = null, matchCode = null, connected = false, applying = false, lastVideoUrl = null;

  const PT = () => window.PT;                       // bridge to the app (state, renderTable, eventHalf)
  const cfg = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const saveCfg = (c) => localStorage.setItem(LS, JSON.stringify(c));
  const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };

  /* ---------- row <-> database row mapping ---------- */
  function rowToDb(r) {
    const row = {
      id: r.id, match_id: matchId, team: r.team, event_name: r.event,
      action_code: r.action || null,
      player_from: toInt(r.playerFrom), player_to: toInt(r.playerTo),
      x: r.pXY ? r.pXY.x : null, y: r.pXY ? r.pXY.y : null,
      rx: r.rXY ? r.rXY.x : null, ry: r.rXY ? r.rXY.y : null,
      t_seconds: r.t, half: PT().eventHalf(r),
      attributes: { raw: r.raw || '', team_name: r.teamName || '', rt: r.rt ?? null, grp: r.grp || null, ord: r.ord ?? 0 }
    };
    // Where the ball crossed the line (shot on target / goal only — see migration 0012).
    // Named ONLY when there is one: PostgREST rejects the whole statement when a column
    // it does not know about is mentioned, so until that migration has been run this
    // keeps the damage to shots instead of failing every event in the match.
    if (r.gXY) { row.goal_x = r.gXY.x; row.goal_y = r.gXY.y; }
    return row;
  }
  function dbToRow(d) {
    const a = d.attributes || {};
    return {
      id: d.id, t: d.t_seconds, rt: a.rt ?? null, team: d.team,
      teamName: a.team_name || d.team, event: d.event_name,
      playerFrom: d.player_from != null ? String(d.player_from) : '',
      playerTo: d.player_to != null ? String(d.player_to) : '',
      action: d.action_code || '', raw: a.raw || '', grp: a.grp || null, ord: a.ord ?? 0,
      pXY: d.x != null ? { x: d.x, y: d.y } : null,
      rXY: d.rx != null ? { x: d.rx, y: d.ry } : null,
      // undefined (column not there yet) reads the same as null (never placed): no spot
      gXY: d.goal_x != null ? { x: d.goal_x, y: d.goal_y } : null
    };
  }

  // shown in both places the connection matters: ☁ Cloud, which owns it, and ⚽ Match,
  // whose controls stay hidden until it is up — otherwise that modal looks simply broken
  function status(txt, ok) {
    ['cloudStatus', 'matchHubStatus'].forEach(id => {
      const el = $(id); if (el) { el.textContent = txt; el.className = 'mini' + (ok ? ' on' : ''); }
    });
  }

  /* ---------- connect + auth ---------- */
  async function connect(silent) {
    const c = cfg();
    // precedence: what the user typed -> what they saved -> CONFIG fallback (so a wrong CONFIG never locks anyone out)
    const url = ($('cloudUrl') ? $('cloudUrl').value.trim() : '') || c.url || CONFIG.url;
    const key = ($('cloudKey') ? $('cloudKey').value.trim() : '') || c.key || CONFIG.anonKey;
    if (!url || !key) { if (!silent) alert('Enter your Supabase URL and anon key.'); return false; }
    saveCfg({ url, key });
    sb = window.supabase.createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } });
    let session = null;
    try {
      ({ data: { session } } = await sb.auth.getSession());
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
    } catch (e) {
      const msg = (e && e.message) || '';
      const net = /failed to fetch|networkerror|load failed|fetch/i.test(msg);
      if (!silent) alert(net
        ? 'Cannot reach Supabase (network / URL problem):\n'
          + '• Check the Project URL is EXACTLY correct (Settings → API)\n'
          + '• Make sure the project is NOT paused — free projects auto-pause after ~1 week idle (Dashboard → Resume)\n'
          + '• Disable ad-blocker / VPN, or try another network or an incognito window'
        : 'Sign-in failed: ' + msg + '\n(Enable "Allow anonymous sign-ins" in Supabase → Authentication.)');
      return false;
    }
    connected = true; status('Connected', true);
    if ($('cloudConnected')) $('cloudConnected').style.display = 'block';
    await initEventTypes();      // shared event dictionary (live)
    // after the dictionary, never before: my codes are resolved ONTO that list
    await initUserPrefs(session);
    await loadTeams();           // teams database -> create-match autocomplete
    return true;
  }

  /* ---------- teams database (public.teams) ---------- */
  // Creating a match requires BOTH teams to already exist in the database.
  // The teams cache feeds the autocomplete in the create-match dialog.
  let teamsCache = [];
  async function loadTeams() {
    if (!connected) return teamsCache;
    const { data, error } = await sb.from('teams').select('id,name').order('name');
    if (error) { console.warn('list teams:', error.message); return teamsCache; }
    teamsCache = data || [];
    return teamsCache;
  }
  // create (or reuse by name) a team in the database; returns {id,name} or null
  async function createTeam(name) {
    name = (name || '').trim();
    if (!name) return null;
    if (!connected && !(await connect())) return null;
    const { data: existing } = await sb.from('teams').select('id,name').ilike('name', name).maybeSingle();
    if (existing) { await loadTeams(); return existing; }
    const { data, error } = await sb.from('teams').insert({ name }).select().single();
    if (error) { alert('Could not create the team: ' + error.message); return null; }
    await loadTeams();
    return data;
  }

  /* ---------- shared event dictionary (event_types) ---------- */
  let applyingET = false, etTimer = null, etChannel = null;
  async function initEventTypes() {
    const { data, error } = await sb.from('event_types').select('*').order('ord');
    if (error) { console.warn('event_types:', error.message); return; }
    if (!data || !data.length) {
      await pushEventTypes(PT().state.events);   // DB empty -> seed it from this browser's list
    } else {
      applyToApp(data);
    }
    subscribeEventTypes();
  }
  function applyToApp(rows) {
    const ev = {};   // applyEventTypes() fills in any missing sports with empty arrays
    rows.forEach(r => { (ev[r.sport] = ev[r.sport] || []).push({ name: r.event_name, key: r.key || '' }); });
    applyingET = true;
    PT().applyEventTypes(ev);     // app sets state.events + localStorage + re-renders
    applyingET = false;
  }
  async function reloadEventTypes() {
    const { data, error } = await sb.from('event_types').select('*').order('ord');
    if (!error && data) applyToApp(data);
  }
  /* The dictionary is the whole site's, so this only ever ADDS to it and re-orders it.
     Two things it deliberately does not do any more:

     `key` is written when an event FIRST enters the table and never again. It is the site
     default — the code a new analyst inherits — and each analyst's real keyboard lives in
     user_prefs. Sending it on every push would put one person's bindings on everybody.

     And nothing is deleted. An event removed here vanished for every analyst at once,
     broke every macro pointing at it, and orphaned the matches already tagged with it.
     (The ✎ / ✖ on the tagger's own Events table are untouched: a tagged row is one
     person's work on one match, and anyone may still edit or delete that.)

     The two writes are separate calls on purpose. PostgREST builds the column list from
     the UNION of the keys across the whole array, so one new event carrying `key` in a
     batch with existing ones would put `key` in the ON CONFLICT ... DO UPDATE SET clause
     and blank the site default on every row that went with it. */
  async function pushEventTypes(events) {
    const { data: existing, error: exErr } = await sb.from('event_types').select('id,sport,event_name');
    if (exErr) { console.warn('event_types read:', exErr.message); return; }
    const known = new Set((existing || []).map(r => r.sport + '|' + r.event_name));
    const fresh = [], seen = [];
    Object.keys(events).forEach(sport =>
      (events[sport] || []).forEach((e, i) => {
        if (known.has(sport + '|' + e.name)) seen.push({ sport, event_name: e.name, ord: i });
        else fresh.push({ sport, event_name: e.name, key: e.key || null, ord: i });
      }));
    if (seen.length) {
      const { error } = await sb.from('event_types').upsert(seen, { onConflict: 'sport,event_name' });
      if (error) { console.warn('event_types upsert:', error.message); return; }
    }
    if (fresh.length) {
      const { error } = await sb.from('event_types').insert(fresh);
      if (error) console.warn('event_types insert:', error.message);
    }
  }
  function subscribeEventTypes() {
    if (etChannel) sb.removeChannel(etChannel);
    etChannel = sb.channel('event_types')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_types' },
        () => { clearTimeout(etTimer); etTimer = setTimeout(reloadEventTypes, 150); })
      .subscribe();
  }
  // called by the app whenever the local event dictionary changes (add / re-order)
  function onEventTypesChanged() {
    if (!connected || applyingET) return;
    clearTimeout(etTimer);
    etTimer = setTimeout(() => pushEventTypes(PT().state.events), 250);
  }

  /* ---------- my keyboard and my macros (user_prefs) ----------
     event_types answers "which events does this website have". This answers "and which
     key do I press for each of them" — one row per account, readable by nobody else.
     Macros live here too: they used to sit in one browser's localStorage and nowhere
     else, which is how a domain move erased every macro on the site. */
  let applyingPrefs = false, upTimer = null, upChannel = null, prefsUid = null;

  /* connect() signs in anonymously when it finds no session, and an anonymous uid is
     thrown away at the end of the visit. Prefs written under one are lost, and the empty
     set read back could go over the real ones — so an anonymous session stays local-only.
     Same rule auth.js applies in user(). */
  const realUid = (session) => {
    const u = session && session.user;
    return (u && u.id && u.is_anonymous !== true) ? u.id : null;
  };

  async function initUserPrefs(session) {
    prefsUid = realUid(session);
    if (!prefsUid) return;
    const { data, error } = await sb.from('user_prefs')
      .select('hotkeys,macros,updated_at').eq('user_id', prefsUid).maybeSingle();
    // a read that failed says NOTHING about what is up there. Pushing now would answer a
    // network error by overwriting the only copy — exactly the way the macros went.
    if (error) { console.warn('user_prefs:', error.message); return; }
    const local = PT().localPrefs();
    if (!data) await pushUserPrefs(local);                                   // nothing stored yet: seed it
    else if (local.at && local.at > Date.parse(data.updated_at || 0)) await pushUserPrefs(local); // edited offline
    else {
      applyingPrefs = true;
      PT().applyUserPrefs({ hotkeys: data.hotkeys || {}, macros: data.macros || {} });
      applyingPrefs = false;
    }
    subscribeUserPrefs();
  }
  async function reloadUserPrefs() {
    if (!prefsUid) return;
    const { data, error } = await sb.from('user_prefs')
      .select('hotkeys,macros').eq('user_id', prefsUid).maybeSingle();
    if (error || !data) return;
    applyingPrefs = true;
    PT().applyUserPrefs({ hotkeys: data.hotkeys || {}, macros: data.macros || {} });
    applyingPrefs = false;
  }
  async function pushUserPrefs(p) {
    if (!prefsUid) return;
    const { error } = await sb.from('user_prefs')
      .upsert({ user_id: prefsUid, hotkeys: (p && p.hotkeys) || {}, macros: (p && p.macros) || {} },
              { onConflict: 'user_id' });
    if (error) console.warn('user_prefs upsert:', error.message);
  }
  function subscribeUserPrefs() {
    if (upChannel) sb.removeChannel(upChannel);
    // filtered to my own row: a second tab signed in as me picks the change up, and RLS
    // means no other account's row could arrive here even unfiltered
    upChannel = sb.channel('user_prefs')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_prefs', filter: 'user_id=eq.' + prefsUid },
        () => { clearTimeout(upTimer); upTimer = setTimeout(reloadUserPrefs, 150); })
      .subscribe();
  }
  // called by the app whenever a hotkey or a macro of mine changes
  function onUserPrefsChanged() {
    if (!connected || !prefsUid || applyingPrefs) return;
    clearTimeout(upTimer);
    upTimer = setTimeout(() => pushUserPrefs(PT().localPrefs()), 250);
  }

  /* ---------- match create / join / load ---------- */
  // create the match for two DB team ids (verified on the DB right before insert)
  async function createMatchWithTeams(hId, aId, matchDate) {
    if (!connected && !(await connect())) return false;
    if (!hId || !aId) { alert('Pick the Home and Away teams from the database first.'); return false; }
    if (hId === aId) { alert('Home and Away must be two different teams.'); return false; }
    const { data: teams, error: tErr } = await sb.from('teams').select('id,name').in('id', [hId, aId]);
    if (tErr || !teams || teams.length < 2) {
      alert('Could not verify both teams in the database' + (tErr ? ': ' + tErr.message : '.'));
      await loadTeams(); return false;
    }
    const home = teams.find(t => t.id === hId), away = teams.find(t => t.id === aId);
    const ins = {
      home_name: home.name, away_name: away.name,
      home_team_id: hId, away_team_id: aId,
      sport: PT().state.sport
    };
    if (matchDate) ins.match_date = matchDate;
    const { data, error } = await sb.from('matches').insert(ins).select().single();
    if (error) { alert('Create match failed: ' + error.message); return false; }
    await openMatchRow(data);                       // data includes the generated 5-digit code
    return true;
  }
  // look a match up by 5-digit code (or uuid) and compute its goal score
  // -> {row, score:[h,a]} | null (not found / not connected)
  async function findMatchByCode(input) {
    if (!connected && !(await connect(true))) return null;   // silent connect so the preview works right after load
    input = (input || '').trim();
    if (!input) return null;
    const col = /^\d{5}$/.test(input) ? 'code' : 'id';
    const { data, error } = await sb.from('matches').select('*').eq(col, input).maybeSingle();
    if (error || !data) return null;
    /* Same rule as computeScore() in index.html and teamGoals() in Stats/stats-view.js:
       a side's goals are its own `goal` events plus the OTHER side's own goals. Asking
       only for 'goal' made the preview read 1 – 0 for a match the scoreboard, the Stats
       page and the report all read 0 – 1. */
    let h = 0, a = 0;
    const { data: goals } = await sb.from('events').select('team,event_name')
      .eq('match_id', data.id).in('event_name', ['goal', 'own goal', 'own-goal']);
    (goals || []).forEach(g => {
      const own = g.event_name !== 'goal';           // an own goal counts for the other side
      if (g.team === 'home' ? !own : own) h++; else a++;
    });
    return { row: data, score: [h, a] };
  }
  async function joinMatch() {
    await openByInput($('cloudMatchId').value);
  }
  // accept a 5-digit code OR a full UUID, resolve to the match row
  async function openByInput(input) {
    if (!connected && !(await connect())) return;
    input = (input || '').trim();
    if (!input) return;
    const col = /^\d{5}$/.test(input) ? 'code' : 'id';
    const { data, error } = await sb.from('matches').select('*').eq(col, input).maybeSingle();
    if (error || !data) { alert('Match not found: ' + input + (error ? '\n(' + error.message + ')' : '')); return; }
    await openMatchRow(data);
  }
  async function openMatchRow(row) {
    const switchingMatch = matchId && matchId !== row.id;   // opening a DIFFERENT match
    matchId = row.id; matchCode = row.code || '';
    // every route into a match comes through here — a typed code, the preview card, a
    // #match= link, and a match just created — so this is where "recently opened" is kept
    if (PT().rememberMatch) PT().rememberMatch(row);
    if ($('cloudMatchId')) $('cloudMatchId').value = matchCode || matchId;
    setTeamInputs(row.home_name, row.away_name);   // load this match's team names
    // link this session to the match (+ its teams) so Player-Lists loads the DB roster
    if (PT().setMatchTeams) PT().setMatchTeams(row.home_team_id || null, row.away_team_id || null, row.id, row.code || null);
    if (row.config) PT().applyCloudDuration(row.config);   // load this match's duration mapping
    // lineups belong to THIS match: load them, or start blank when the match has none yet
    // (the match id travels along so the local copy is stamped for the right match)
    if (row.lineups) PT().applyCloudLineups(row.lineups, row.id);
    else if (PT().resetLineups) PT().resetLineups(row.id);
    // the video belongs to THIS match: load its shared URL, or — when switching to a match
    // that has none — unload whatever was playing, or the PREVIOUS match's video keeps
    // running on the new one (bug: 32746's video played on 51977).
    lastVideoUrl = row.video_url || null;
    if (row.video_url) PT().loadVideoUrl(row.video_url);
    else if (switchingMatch && PT().unloadVideo) PT().unloadVideo();
    // Load ALL events in pages — Supabase caps a single select at 1000 rows, so a
    // busy match (1300+ events) silently truncated to the first ~63 minutes on reload.
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('events').select('*')
        .eq('match_id', matchId).order('t_seconds').range(from, from + PAGE - 1);
      if (error) { alert('Load failed: ' + error.message); return; }
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    applying = true;
    PT().state.rows = all.map(dbToRow);
    PT().renderTable();
    applying = false;
    subscribe();
    status('Live · #' + (matchCode || matchId.slice(0, 8)) + ' (' + PT().state.rows.length + ')', true);
    // reflect the open match in the address bar (…/#match=53830) so the URL itself is shareable
    try { history.replaceState(null, '', '#match=' + (matchCode || matchId)); } catch (e) {}
  }

  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('match:' + matchId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: 'match_id=eq.' + matchId },
        applyRemote)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'id=eq.' + matchId },
        (p) => {                                          // live team-name + duration + video sync
          if (!p.new) return;
          setTeamInputs(p.new.home_name, p.new.away_name);
          if (p.new.config) PT().applyCloudDuration(p.new.config);
          if (p.new.lineups) PT().applyCloudLineups(p.new.lineups, matchId);
          // video changed on THIS match (a URL was set, swapped, or removed)
          if ((p.new.video_url || null) !== lastVideoUrl) {
            lastVideoUrl = p.new.video_url || null;
            if (p.new.video_url) PT().loadVideoUrl(p.new.video_url);
            else if (PT().unloadVideo) PT().unloadVideo();
          }
        })
      .subscribe();
  }

  /* ---------- video source (matches.video_url) ---------- */
  // Save a hosted video URL onto the current match so everyone plays it and it persists.
  // Returns false when not in a shared match (the app then just plays it locally).
  async function setVideoUrl(url) {
    if (!connected || !matchId) return false;
    const { error } = await sb.from('matches').update({ video_url: url }).eq('id', matchId);
    if (error) { console.warn('video_url save:', error.message); return false; }
    lastVideoUrl = url;
    return true;
  }
  // Upload a file straight to Cloudflare R2 via a presigned PUT URL from the Worker.
  // onProgress(fraction 0..1). Returns the public URL to store in matches.video_url.
  async function uploadToR2(file, onProgress) {
    const R2 = CONFIG.R2 || {};
    if (!R2.workerUrl) throw new Error('R2 not configured (set CONFIG.R2.workerUrl).');
    // 1) ask the Worker to sign an upload URL for this match
    const resp = await fetch(R2.workerUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchId, filename: file.name, contentType: file.type || 'video/mp4' })
    });
    if (!resp.ok) throw new Error('sign failed (' + resp.status + ')');
    const { uploadUrl, publicUrl } = await resp.json();
    if (!uploadUrl || !publicUrl) throw new Error('bad sign response');
    // 2) PUT the bytes directly to R2 (XHR so we get upload progress)
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('R2 PUT ' + xhr.status));
      xhr.onerror = () => reject(new Error('network error during upload'));
      xhr.send(file);
    });
    return publicUrl;
  }

  // set the Home/Away name boxes without re-triggering a cloud write
  function setTeamInputs(home, away) {
    if (home != null && $('homeName').value !== home) $('homeName').value = home;
    if (away != null && $('awayName').value !== away) $('awayName').value = away;
  }
  // called by the app when the user edits a team name
  async function onTeamNamesChanged(home, away) {
    if (!connected || !matchId) return;
    const { error } = await sb.from('matches').update({ home_name: home, away_name: away }).eq('id', matchId);
    if (error) console.warn('match name update:', error.message);
  }
  // called by the app when the Match Duration settings change -> save on the match (matches.config)
  let durTimer = null;
  function onDurationChanged(d) {
    if (!connected || !matchId) return;
    clearTimeout(durTimer);
    durTimer = setTimeout(async () => {
      const { error } = await sb.from('matches').update({ config: d }).eq('id', matchId);
      if (error) console.warn('duration save:', error.message);
    }, 250);
  }
  // Called by the app when player lists / formation change -> save on the match
  // (matches.lineups). `forMatchId` names the match the caller's lineups belong to and
  // MUST match the open one: a lineup set is per-match, and a copy that came from another
  // match (or from a window with no match open, i.e. an empty one) would otherwise be
  // written straight over this match's squad and formation — the data-loss bug.
  let luTimer = null;
  function onLineupsChanged(l, forMatchId) {
    if (!connected || !matchId) return;
    if (String(forMatchId || '') !== String(matchId)) {
      console.warn('lineups save skipped: copy belongs to match', forMatchId || '(none)', 'not', matchId);
      return;
    }
    const forId = matchId;
    clearTimeout(luTimer);
    luTimer = setTimeout(async () => {
      if (forId !== matchId) return;                 // another match was opened while we waited
      const { error } = await sb.from('matches').update({ lineups: l }).eq('id', forId);
      if (error) console.warn('lineups save:', error.message);
    }, 300);
  }

  const findIdx = (id) => PT().state.rows.findIndex((r) => r.id === id);
  function applyRemote(payload) {
    const rows = PT().state.rows;
    applying = true;
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const r = dbToRow(payload.new), i = findIdx(r.id);
      if (i >= 0) rows[i] = r; else rows.push(r);
    } else if (payload.eventType === 'DELETE') {
      const i = findIdx(payload.old.id); if (i >= 0) rows.splice(i, 1);
    }
    PT().renderTable();
    if (matchId) status('Live · #' + (matchCode || matchId.slice(0, 8)) + ' (' + rows.length + ')', true);
    applying = false;
  }

  /* ---------- hooks the app calls on local edits ---------- */
  async function onLocalUpsert(row) {
    if (!connected || !matchId || applying) return;
    const { error } = await sb.from('events').upsert(rowToDb(row), { onConflict: 'id' });
    if (error) console.warn('cloud upsert:', error.message);
  }
  async function onLocalDelete(id) {
    if (!connected || !matchId || applying || !id) return;
    const { error } = await sb.from('events').delete().eq('id', id);
    if (error) console.warn('cloud delete:', error.message);
  }

  /* ---------- Submit Analysis ----------
     The border between this app and the client site. Everything above happens
     as it is tagged; what crosses over is one signed-off row — the match as it
     stood when somebody said it was finished.

     Read back OUT of the database rather than out of this tab's localStorage.
     A snapshot has to be what is actually stored, not what one browser happens
     to be holding, and the two are compared before anything is published: a
     report that is short of events is the hardest kind of wrong to notice,
     because every number in it still adds up. */
  async function fetchAllEvents(id) {
    const PAGE = 1000, all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('events').select('*')
        .eq('match_id', id).order('t_seconds').range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  /* The five things Stats renders from, and nothing else. Scores, kick-off and
     competition stay on public.matches — the client site already reads those. */
  async function buildReport() {
    if (!connected || !matchId) throw new Error('Open a match on the cloud first.');
    const { data: m, error } = await sb.from('matches').select('*').eq('id', matchId).single();
    if (error) throw error;
    const stored = await fetchAllEvents(matchId);
    const local = ((PT() && PT().state && PT().state.rows) || []).length;
    return {
      localCount: local,
      eventCount: stored.length,
      payload: {
        schema: 1,
        meta: {
          home: m.home_name, away: m.away_name, sport: m.sport || 'football',
          homeTeamId: m.home_team_id || null, awayTeamId: m.away_team_id || null,
          matchId: m.id, matchCode: m.code || null
        },
        // the starting XI AND the substitution history — without the history every
        // stat after the first change is worked out against the wrong eleven
        lineups: (m.lineups && m.lineups.home && m.lineups.away) ? m.lineups : null,
        dur: Object.assign({ enabled: false, halfLen: 45, h1Start: 0, h1End: 0, h2Start: 0, h2End: 0 },
                           m.config || {}),
        /* The video the tags were placed against, frozen beside the mapping that
           carves it into halves. Read live instead and one re-upload would leave
           every t pointing at the wrong moment of a different file — silently,
           because the overlay would still draw, just in the wrong places.

           A match tagged from a local file has no shared URL, so it gets none:
           the club's browser cannot reach the analyst's disk, and Film says so
           rather than showing a dead player. */
        video: m.video_url
          ? { url: m.video_url, frozenAt: new Date().toISOString(),
              kind: (CONFIG.R2 && CONFIG.R2.publicBase &&
                     String(m.video_url).indexOf(CONFIG.R2.publicBase) === 0) ? 'r2' : 'url' }
          : null,
        rows: stored.map(dbToRow)
      }
    };
  }

  async function reportClubs() {
    if (!connected) throw new Error('Connect to the cloud first.');
    const { data, error } = await sb.from('clubs').select('id,name,slug,crest_text').order('name');
    if (error) throw error;
    return data || [];
  }

  /* One transaction on the far side: the report is written and the match is
     pointed at the channel and marked published, or neither happens.

     `gate` is the caller's veto, run on the built payload and before the RPC:
     return a string to refuse, anything falsy to go ahead. It lives here rather
     than in the dialog so that what is judged and what is written are the same
     build — cloud-sync does not know what a fair aerial duel count looks like,
     and the tagging app does not get to hold a payload that this one re-fetches. */
  async function publishReport(clubId, gate) {
    const built = await buildReport();
    if (gate) { const stop = gate(built.payload); if (stop) throw new Error(stop); }
    const { data, error } = await sb.rpc('publish_match_report', {
      p_match_id: matchId, p_club_id: clubId,
      p_payload: built.payload, p_event_count: built.eventCount, p_schema: 1
    });
    if (error) throw error;
    return { version: (data && data.version) || null, eventCount: built.eventCount };
  }

  /* What the open match was last published as, so the header can say how far
     the tagging has moved on since — an analyst who keeps correcting after
     publishing would otherwise think the club is seeing the corrections. */
  async function reportStatus() {
    if (!connected || !matchId) return null;
    const { data } = await sb.from('match_reports')
      .select('version,event_count,published_at')
      .eq('match_id', matchId).order('version', { ascending: false }).limit(1);
    return (data && data[0]) || null;
  }

  window.Cloud = {
    get connected() { return connected; },
    get matchId() { return matchId; },
    get matchCode() { return matchCode; },
    get r2Enabled() { return !!(CONFIG.R2 && CONFIG.R2.workerUrl); },
    get teams() { return teamsCache; },
    loadTeams, createTeam, createMatchWithTeams, findMatchByCode,
    openMatch: openByInput,
    onLocalUpsert, onLocalDelete, onEventTypesChanged, onUserPrefsChanged,
    onTeamNamesChanged, onDurationChanged, onLineupsChanged,
    setVideoUrl, uploadToR2,
    buildReport, reportClubs, publishReport, reportStatus
  };

  /* ---------- UI wiring ---------- */
  function init() {
    if (!$('cloudBtn')) return;
    const c = cfg();
    if ($('cloudUrl')) { $('cloudUrl').value = c.url || CONFIG.url || ''; $('cloudKey').value = c.key || CONFIG.anonKey || ''; }
    // ☁ Cloud (in ▾ Other) is the connection; ⚽ Match is what you do with it. Two modals,
    // one set of controls — every id below is where it always was, just split across them.
    $('cloudClose').onclick = () => $('cloudModal').classList.remove('show');
    $('cloudModal').addEventListener('click', (e) => { if (e.target === $('cloudModal')) $('cloudModal').classList.remove('show'); });
    $('cloudConnect').onclick = () => connect();
    if ($('matchHubClose')) $('matchHubClose').onclick = () => $('matchHub').classList.remove('show');
    if ($('matchHub')) $('matchHub').addEventListener('click', (e) => { if (e.target === $('matchHub')) $('matchHub').classList.remove('show'); });
    // "＋ New match" opens the create-match dialog (teams from the database)
    $('cloudCreate').onclick = async () => {
      if (!connected && !(await connect())) return;
      await loadTeams();
      if (PT().openMatchModal) PT().openMatchModal();
    };
    $('cloudJoin').onclick = joinMatch;
    // a 5-digit code in the Match ID box shows the match info card (home / away /
    // score / date) — click it to open. Runs on typing, on focus, and when the
    // modal opens with a code already in the box (e.g. auto-filled by a join).
    let findTimer = null;
    const previewMatchId = () => {
      if (!$('cloudMatchId')) return;
      clearTimeout(findTimer);
      const v = $('cloudMatchId').value.trim();
      if (!/^\d{5}$/.test(v)) { if (PT().renderMatchPreview) PT().renderMatchPreview(null); return; }
      findTimer = setTimeout(async () => {
        const res = await findMatchByCode(v);
        if (PT().renderMatchPreview) PT().renderMatchPreview(res || { notFound: true });
      }, 300);
    };
    if ($('cloudMatchId')) ['input', 'focus', 'keyup'].forEach(ev =>
      $('cloudMatchId').addEventListener(ev, previewMatchId));
    $('cloudBtn').onclick = () => $('cloudModal').classList.add('show');
    // the preview card is refreshed on open, in case a code is already in the box
    if ($('matchBtn')) $('matchBtn').onclick = () => { $('matchHub').classList.add('show'); previewMatchId(); };
    // auto-connect on load when credentials are saved/configured, so the shared event
    // dictionary syncs without clicking Connect; also auto-join a #match=<code> link.
    if (c.url || CONFIG.url) (async () => {
      if (await connect(true)) {
        const m = location.hash.match(/match=([0-9a-z-]{5,36})/i);
        if (m) await openByInput(m[1]);
      }
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
