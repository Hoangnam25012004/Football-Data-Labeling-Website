/* ===========================================================================
   Cloud real-time sync (Supabase) for the Football Data Labeling app.
   Loads after index.html's main script and talks to it via window.PT.
   Requires @supabase/supabase-js (loaded from CDN in index.html).

   To make the site work for everyone without each person entering keys,
   paste your project's PUBLIC values here (the anon key is safe to commit —
   it is protected by Row-Level Security):
=========================================================================== */
const CONFIG = { url: 'https://abcdxyz.supabase.co', anonKey: 'eyJ...' };

(function () {
  const $ = (id) => document.getElementById(id);
  const LS = 'pitchtagger.cloud.cfg';
  let sb = null, channel = null, matchId = null, connected = false, applying = false;

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
  async function connect() {
    const c = cfg();
    const url = CONFIG.url || ($('cloudUrl') ? $('cloudUrl').value.trim() : '') || c.url;
    const key = CONFIG.anonKey || ($('cloudKey') ? $('cloudKey').value.trim() : '') || c.key;
    if (!url || !key) { alert('Enter your Supabase URL and anon key.'); return false; }
    saveCfg({ url, key });
    sb = window.supabase.createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } });
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) { alert('Sign-in failed: ' + error.message + '\n(Enable "Allow anonymous sign-ins" in Supabase Auth.)'); return false; }
      session = data.session;
    }
    connected = true; status('Connected', true);
    if ($('cloudConnected')) $('cloudConnected').style.display = 'block';
    await loadRecentMatches();
    return true;
  }

  /* ---------- list recent matches into the dropdown ---------- */
  async function loadRecentMatches() {
    if (!connected) return;
    const sel = $('cloudMatchList'); if (!sel) return;
    const { data, error } = await sb.from('matches')
      .select('id,home_name,away_name,created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) { console.warn('list matches:', error.message); return; }
    sel.innerHTML = '<option value="">— select a match —</option>' +
      (data || []).map(m => {
        const d = (m.created_at || '').slice(0, 16).replace('T', ' ');
        return `<option value="${m.id}">${m.home_name} vs ${m.away_name} · ${d} · ${m.id.slice(0, 8)}</option>`;
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
    await openMatch(data.id);
  }
  async function joinMatch() {
    const id = ($('cloudMatchId').value || '').trim();
    if (id) await openMatch(id);
  }
  async function openMatch(id) {
    if (!connected && !(await connect())) return;
    matchId = id; $('cloudMatchId').value = id;
    const { data, error } = await sb.from('events').select('*').eq('match_id', id).order('t_seconds');
    if (error) { alert('Load failed: ' + error.message); return; }
    applying = true;
    PT().state.rows = (data || []).map(dbToRow);
    PT().renderTable();
    applying = false;
    subscribe();
    status('Live · ' + id.slice(0, 8) + ' (' + PT().state.rows.length + ')', true);
    const link = location.origin + location.pathname + '#match=' + id;
    if ($('cloudShare')) { $('cloudShare').value = link; $('cloudShareRow').style.display = 'flex'; }
  }

  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('match:' + matchId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: 'match_id=eq.' + matchId },
        applyRemote)
      .subscribe();
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
    if (matchId) status('Live · ' + matchId.slice(0, 8) + ' (' + rows.length + ')', true);
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
    onLocalUpsert, onLocalDelete
  };

  /* ---------- UI wiring ---------- */
  function init() {
    if (!$('cloudBtn')) return;
    const c = cfg();
    if ($('cloudUrl')) { $('cloudUrl').value = CONFIG.url || c.url || ''; $('cloudKey').value = CONFIG.anonKey || c.key || ''; }
    $('cloudBtn').onclick = () => $('cloudModal').classList.add('show');
    $('cloudClose').onclick = () => $('cloudModal').classList.remove('show');
    $('cloudModal').addEventListener('click', (e) => { if (e.target === $('cloudModal')) $('cloudModal').classList.remove('show'); });
    $('cloudConnect').onclick = connect;
    $('cloudCreate').onclick = createMatch;
    $('cloudJoin').onclick = joinMatch;
    if ($('cloudMatchList')) $('cloudMatchList').onchange = (e) => { if (e.target.value) openMatch(e.target.value); };
    if ($('cloudRefresh')) $('cloudRefresh').onclick = loadRecentMatches;
    $('cloudCopy').onclick = () => { $('cloudShare').select(); document.execCommand('copy'); };
    // deep link: open the site with #match=<id> to auto-join
    const m = location.hash.match(/match=([0-9a-f-]{36})/i);
    if (m && (CONFIG.url || c.url)) (async () => { if (await connect()) await openMatch(m[1]); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
