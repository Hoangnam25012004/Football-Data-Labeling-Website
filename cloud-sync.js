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
  url: '', anonKey: '',
  // Optional: direct-to-R2 video upload. Deploy worker/r2-presign.js (see worker/README.md),
  // then paste its URL + your bucket's public base here. Leave workerUrl '' to hide the R2 button
  // (pasting a video URL manually still works without any of this).
  R2: { workerUrl: '', publicBase: '' }
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
    await loadTeams();           // teams database -> home/away pickers
    await loadRecentMatches();
    return true;
  }

  /* ---------- teams database (public.teams) ---------- */
  // Creating a match requires BOTH teams to already exist in the database:
  // pick them here, or create them first with the ＋ buttons.
  async function loadTeams() {
    if (!connected) return;
    const { data, error } = await sb.from('teams').select('id,name').order('name');
    if (error) { console.warn('list teams:', error.message); return; }
    ['cloudHomeTeam', 'cloudAwayTeam'].forEach((id, i) => {
      const sel = $(id); if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = `<option value="">— select ${i ? 'away' : 'home'} team —</option>` +
        (data || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      if (cur && (data || []).some(t => t.id === cur)) sel.value = cur;
    });
  }
  // create a team in the database, then select it in the given picker
  async function addTeam(selId) {
    if (!connected && !(await connect())) return;
    const name = (prompt('Tên team mới (lưu vào database):') || '').trim();
    if (!name) return;
    // reuse an existing team with the same name instead of duplicating it
    const { data: existing } = await sb.from('teams').select('id,name').ilike('name', name).maybeSingle();
    let team = existing;
    if (!team) {
      const { data, error } = await sb.from('teams').insert({ name }).select().single();
      if (error) { alert('Không tạo được team: ' + error.message); return; }
      team = data;
    }
    await loadTeams();
    if ($(selId)) $(selId).value = team.id;
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
  async function pushEventTypes(events) {
    const rows = [];
    Object.keys(events).forEach(sport =>
      (events[sport] || []).forEach((e, i) => rows.push({ sport, event_name: e.name, key: e.key || null, ord: i })));
    if (rows.length) {
      const { error } = await sb.from('event_types').upsert(rows, { onConflict: 'sport,event_name' });
      if (error) { console.warn('event_types upsert:', error.message); return; }
    }
    // delete rows that no longer exist locally
    const { data: existing } = await sb.from('event_types').select('id,sport,event_name');
    const keep = new Set(rows.map(r => r.sport + '|' + r.event_name));
    const del = (existing || []).filter(r => !keep.has(r.sport + '|' + r.event_name)).map(r => r.id);
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
    // a match may only be created for teams that already exist in public.teams
    const hId = $('cloudHomeTeam') ? $('cloudHomeTeam').value : '';
    const aId = $('cloudAwayTeam') ? $('cloudAwayTeam').value : '';
    if (!hId || !aId) { alert('Chọn team Home và Away từ database trước khi tạo match.\n(Chưa có team? Bấm ＋ để tạo và lưu vào database.)'); return; }
    if (hId === aId) { alert('Home và Away phải là hai team khác nhau.'); return; }
    // verify both ids really exist in the database right before creating the match
    const { data: teams, error: tErr } = await sb.from('teams').select('id,name').in('id', [hId, aId]);
    if (tErr || !teams || teams.length < 2) {
      alert('Không xác thực được 2 teams trên database' + (tErr ? ': ' + tErr.message : '.') + '\nDanh sách teams sẽ được tải lại — chọn lại rồi thử tiếp.');
      await loadTeams(); return;
    }
    const home = teams.find(t => t.id === hId), away = teams.find(t => t.id === aId);
    const { data, error } = await sb.from('matches').insert({
      home_name: home.name,
      away_name: away.name,
      home_team_id: hId,
      away_team_id: aId,
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
    // link this session to the match's teams so Player-Lists loads the DB roster
    if (PT().setMatchTeams) PT().setMatchTeams(row.home_team_id || null, row.away_team_id || null);
    if (row.config) PT().applyCloudDuration(row.config);   // load this match's duration mapping
    if (row.lineups) PT().applyCloudLineups(row.lineups);  // load this match's player lists / formation
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
        (p) => {                                          // live team-name + duration + video sync
          if (!p.new) return;
          setTeamInputs(p.new.home_name, p.new.away_name);
          if (p.new.config) PT().applyCloudDuration(p.new.config);
          if (p.new.lineups) PT().applyCloudLineups(p.new.lineups);
          if (p.new.video_url && p.new.video_url !== lastVideoUrl) {
            lastVideoUrl = p.new.video_url; PT().loadVideoUrl(p.new.video_url);
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
  // called by the app when player lists / formation change -> save on the match (matches.lineups)
  let luTimer = null;
  function onLineupsChanged(l) {
    if (!connected || !matchId) return;
    clearTimeout(luTimer);
    luTimer = setTimeout(async () => {
      const { error } = await sb.from('matches').update({ lineups: l }).eq('id', matchId);
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

  window.Cloud = {
    get connected() { return connected; },
    get matchId() { return matchId; },
    get r2Enabled() { return !!(CONFIG.R2 && CONFIG.R2.workerUrl); },
    onLocalUpsert, onLocalDelete, onEventTypesChanged, onTeamNamesChanged, onDurationChanged, onLineupsChanged,
    setVideoUrl, uploadToR2
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
    if ($('cloudRefresh')) $('cloudRefresh').onclick = () => { loadTeams(); loadRecentMatches(); };
    if ($('cloudHomeTeamAdd')) $('cloudHomeTeamAdd').onclick = () => addTeam('cloudHomeTeam');
    if ($('cloudAwayTeamAdd')) $('cloudAwayTeamAdd').onclick = () => addTeam('cloudAwayTeam');
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
