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
const CONFIG = { url: '', anonKey: '' };

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
    return {
      id: r.id, match_id: matchId, team: r.team, event_name: r.event,
      action_code: r.action || null,
      player_from: toInt(r.playerFrom), player_to: toInt(r.playerTo),
      x: r.pXY ? r.pXY.x : null, y: r.pXY ? r.pXY.y : null,
      rx: r.rXY ? r.rXY.x : null, ry: r.rXY ? r.rXY.y : null,
      t_seconds: r.t, half: PT().eventHalf(r),
      attributes: { raw: r.raw || '', team_name: r.teamName || '', rt: r.rt ?? null }
    };
  }
  function dbToRow(d) {
    const a = d.attributes || {};
    return {
      id: d.id, t: d.t_seconds, rt: a.rt ?? null, team: d.team,
      teamName: a.team_name || d.team, event: d.event_name,
      playerFrom: d.player_from != null ? String(d.player_from) : '',
      playerTo: d.player_to != null ? String(d.player_to) : '',
      action: d.action_code || '', raw: a.raw || '',
      pXY: d.x != null ? { x: d.x, y: d.y } : null,
      rXY: d.rx != null ? { x: d.rx, y: d.ry } : null
    };
  }

  function status(txt, ok) { const el = $('cloudStatus'); if (el) { el.textContent = txt; el.className = 'mini' + (ok ? ' on' : ''); } }

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
    await loadRecentMatches();
    return true;
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
    const ev = { football: [], hockey: [] };
    rows.forEach(r => { (ev[r.sport] = ev[r.sport] || []).push({ name: r.name, key: r.key || '' }); });
    applyingET = true;
    PT().applyEventTypes(ev);     // app sets state.events + localStorage + re-renders
    applyingET = false;
  }
  async function reloadEventTypes() {
    const { data, error } = await sb.from('event_types').select('*').order('ord');
    if (!error && data) applyToApp(data);
  }
  async function pushEventTypes(events) {
    const rows = [];
    ['football', 'hockey'].forEach(sport =>
      (events[sport] || []).forEach((e, i) => rows.push({ sport, name: e.name, key: e.key || null, ord: i })));
    if (rows.length) {
      const { error } = await sb.from('event_types').upsert(rows, { onConflict: 'sport,name' });
      if (error) { console.warn('event_types upsert:', error.message); return; }
    }
    // delete rows that no longer exist locally
    const { data: existing } = await sb.from('event_types').select('id,sport,name');
    const keep = new Set(rows.map(r => r.sport + '|' + r.name));
    const del = (existing || []).filter(r => !keep.has(r.sport + '|' + r.name)).map(r => r.id);
    if (del.length) await sb.from('event_types').delete().in('id', del);
  }
  function subscribeEventTypes() {
    if (etChannel) sb.removeChannel(etChannel);
    etChannel = sb.channel('event_types')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_types' },
        () => { clearTimeout(etTimer); etTimer = setTimeout(reloadEventTypes, 150); })
      .subscribe();
  }
  // called by the app whenever the local event dictionary changes (add/delete/key)
  function onEventTypesChanged() {
    if (!connected || applyingET) return;
    clearTimeout(etTimer);
    etTimer = setTimeout(() => pushEventTypes(PT().state.events), 250);
  }

  /* ---------- list recent matches into the dropdown ---------- */
  async function loadRecentMatches() {
    if (!connected) return;
    const sel = $('cloudMatchList'); if (!sel) return;
    const { data, error } = await sb.from('matches')
      .select('*')
      .order('created_at', { ascending: false }).limit(50);
    if (error) { console.warn('list matches:', error.message); return; }
    sel.innerHTML = '<option value="">— select a match —</option>' +
      (data || []).map(m => {
        const d = (m.created_at || '').slice(0, 16).replace('T', ' ');
        return `<option value="${m.code || m.id}">#${m.code || '?'} · ${m.home_name} vs ${m.away_name} · ${d}</option>`;
      }).join('');
  }

  /* ---------- match create / join / load ---------- */
  async function createMatch() {
    if (!connected && !(await connect())) return;
    const { data, error } = await sb.from('matches').insert({
      home_name: $('homeName').value || 'Home',
      away_name: $('awayName').value || 'Away',
      sport: PT().state.sport
    }).select().single();
    if (error) { alert('Create match failed: ' + error.message); return; }
    await openMatchRow(data);                       // data includes the generated 5-digit code
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
    matchId = row.id; matchCode = row.code || '';
    if ($('cloudMatchId')) $('cloudMatchId').value = matchCode || matchId;
    setTeamInputs(row.home_name, row.away_name);   // load this match's team names
    lastVideoUrl = row.video_url || null;
    if (row.video_url) PT().loadVideoUrl(row.video_url);   // load the shared video for this match
    const { data, error } = await sb.from('events').select('*').eq('match_id', matchId).order('t_seconds');
    if (error) { alert('Load failed: ' + error.message); return; }
    applying = true;
    PT().state.rows = (data || []).map(dbToRow);
    PT().renderTable();
    applying = false;
    subscribe();
    status('Live · #' + (matchCode || matchId.slice(0, 8)) + ' (' + PT().state.rows.length + ')', true);
    const link = location.origin + location.pathname + '#match=' + (matchCode || matchId);
    if ($('cloudShare')) { $('cloudShare').value = link; $('cloudShareRow').style.display = 'flex'; }
  }

  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('match:' + matchId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: 'match_id=eq.' + matchId },
        applyRemote)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'id=eq.' + matchId },
        (p) => {                                                    // live team-name + shared-video sync
          if (!p.new) return;
          setTeamInputs(p.new.home_name, p.new.away_name);
          if (p.new.video_url && p.new.video_url !== lastVideoUrl) {
            lastVideoUrl = p.new.video_url; PT().loadVideoUrl(p.new.video_url);
          }
        })
      .subscribe();
  }

  // NOTE: video upload removed — see the long-term storage plan (Cloudflare R2 / Stream).
  // The app can still PLAY a shared video by reading matches.video_url, so once an external
  // store is wired in (presigned upload -> set matches.video_url), playback works unchanged.

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

  window.Cloud = {
    get connected() { return connected; },
    get matchId() { return matchId; },
    onLocalUpsert, onLocalDelete, onEventTypesChanged, onTeamNamesChanged
  };

  /* ---------- UI wiring ---------- */
  function init() {
    if (!$('cloudBtn')) return;
    const c = cfg();
    if ($('cloudUrl')) { $('cloudUrl').value = c.url || CONFIG.url || ''; $('cloudKey').value = c.key || CONFIG.anonKey || ''; }
    $('cloudBtn').onclick = () => $('cloudModal').classList.add('show');
    $('cloudClose').onclick = () => $('cloudModal').classList.remove('show');
    $('cloudModal').addEventListener('click', (e) => { if (e.target === $('cloudModal')) $('cloudModal').classList.remove('show'); });
    $('cloudConnect').onclick = () => connect();
    $('cloudCreate').onclick = createMatch;
    $('cloudJoin').onclick = joinMatch;
    if ($('cloudMatchList')) $('cloudMatchList').onchange = (e) => { if (e.target.value) openByInput(e.target.value); };
    if ($('cloudRefresh')) $('cloudRefresh').onclick = loadRecentMatches;
    $('cloudCopy').onclick = () => { $('cloudShare').select(); document.execCommand('copy'); };
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
