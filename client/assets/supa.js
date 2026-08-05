/* ============================================================
   Data layer for the client site.

   Talks to the same Supabase project the tagging app writes into,
   so a match tagged on the labeling site turns up here as soon as
   an analyst points it at a channel and publishes it.

   Everything degrades: no session → the app shows the seed channel;
   no channels → seed channel; view missing → matches without stats.
   The UI never has to know which source it got.
   ============================================================ */
(function (global) {
  'use strict';

  var CONFIG = {
    url: 'https://xtzmtdcohoixoxqusyyz.supabase.co',
    anonKey: 'sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa'
  };

  var sb = null;
  function client() {
    if (sb) return sb;
    if (!global.supabase || !global.supabase.createClient) return null;
    sb = global.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hna-client-auth' }
    });
    return sb;
  }

  /* ---------- helpers ---------- */
  function monogram(name) {
    if (!name) return '???';
    var clean = String(name).replace(/[^A-Za-zÀ-ÿ ]/g, '').trim();
    var parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0] + (parts[1][1] || '')).toUpperCase();
    return clean.slice(0, 3).toUpperCase();
  }

  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function dateLabel(iso) {
    if (!iso) return 'Date not set';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function pct(part, whole) {
    if (!whole) return null;
    return Math.round((part / whole) * 1000) / 10;
  }

  /* Turn a match_stats row into the shape the UI renders. Metrics the
     view cannot derive stay null and the UI simply leaves them out —
     better a missing row than an invented one. */
  function statsFromView(r) {
    if (!r) return null;
    return {
      poss: null,
      goals: r.goals, assists: null, keyPasses: null,
      shots: r.shots, onTarget: r.on_target, offTarget: r.off_target,
      blocked: r.blocked, missed: null,
      shotAcc: pct(r.on_target, r.shots),
      passes: r.passes, passesDone: r.passes_done, passAcc: pct(r.passes_done, r.passes),
      crosses: r.crosses, crossesDone: r.crosses_done,
      takeOns: r.take_ons, takeOnsWon: null, stepIns: r.step_ins,
      tackles: r.tackles, tacklesWon: null, tackleAcc: null,
      interceptions: r.interceptions, recoveries: null,
      clearances: r.clearances, blocks: null,
      aerial: r.aerial_duels, aerialWon: null, ground: null, groundWon: null,
      mistakes: null,
      eventsTagged: r.events_tagged
    };
  }

  var API = {
    configured: function () { return !!client(); },

    /* ---------- auth ---------- */
    auth: {
      session: function () {
        var c = client();
        if (!c) return Promise.resolve(null);
        return c.auth.getSession()
          .then(function (r) { return (r && r.data && r.data.session) || null; })
          .catch(function () { return null; });
      },
      user: function () {
        return API.auth.session().then(function (s) { return s ? s.user : null; });
      },
      signIn: function (email, password) {
        var c = client();
        if (!c) return Promise.reject(new Error('Sign-in is unavailable: the Supabase client did not load.'));
        return c.auth.signInWithPassword({ email: email, password: password })
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      signOut: function () {
        var c = client();
        return c ? c.auth.signOut().catch(function () {}) : Promise.resolve();
      }
    },

    /* ---------- channels ---------- */
    clubs: function () {
      var c = client();
      if (!c) return Promise.resolve([]);
      return c.from('clubs').select('id,slug,name,crest_text,competition,stage').order('name')
        .then(function (r) {
          if (r.error || !r.data) return [];
          return r.data.map(function (x) {
            return {
              id: x.id, slug: x.slug, name: x.name,
              crest: x.crest_text || monogram(x.name),
              competition: x.competition || '', stage: x.stage || ''
            };
          });
        })
        .catch(function () { return []; });
    },

    /* ---------- matches in a channel ---------- */
    matches: function (clubId) {
      var c = client();
      if (!c) return Promise.resolve([]);
      return c.from('matches')
        .select('id,match_code,home_name,away_name,home_score,away_score,kickoff,competition,stage,venue,our_side,published')
        .eq('club_id', clubId).eq('published', true)
        .order('kickoff', { ascending: true })
        .then(function (r) {
          if (r.error || !r.data || !r.data.length) return [];
          var rows = r.data;
          var ids = rows.map(function (m) { return m.id; });
          return c.from('match_stats').select('*').in('match_id', ids)
            .then(function (s) { return shape(rows, (s && s.data) || []); })
            .catch(function () { return shape(rows, []); });
        })
        .catch(function () { return []; });

      function shape(rows, statRows) {
        var byMatch = {};
        statRows.forEach(function (s) {
          byMatch[s.match_id] = byMatch[s.match_id] || {};
          byMatch[s.match_id][s.team] = s;
        });
        return rows.map(function (m) {
          var side = m.our_side === 'away' ? 'away' : 'home';
          var other = side === 'home' ? 'away' : 'home';
          var ourScore = side === 'home' ? m.home_score : m.away_score;
          var theirScore = side === 'home' ? m.away_score : m.home_score;
          var result = null;
          if (ourScore != null && theirScore != null) {
            result = ourScore > theirScore ? 'W' : (ourScore < theirScore ? 'L' : 'D');
          }
          var st = byMatch[m.id] || {};
          return {
            id: m.match_code || m.id,
            uuid: m.id,
            slug: String(m.match_code || m.id),
            date: m.kickoff,
            dateLabel: dateLabel(m.kickoff),
            home: { name: m.home_name, crest: monogram(m.home_name), score: m.home_score },
            away: { name: m.away_name, crest: monogram(m.away_name), score: m.away_score },
            side: side,
            result: result,
            opponent: side === 'home' ? m.away_name : m.home_name,
            venue: m.venue || (side === 'home' ? 'Home' : 'Away'),
            competition: m.competition || '',
            stage: m.stage || '',
            timeline: [],
            us: statsFromView(st[side]),
            them: statsFromView(st[other]),
            live: true
          };
        });
      }
    }
  };

  API.monogram = monogram;
  API.dateLabel = dateLabel;
  global.HNA = API;
})(window);
