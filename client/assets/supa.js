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
  /* Accents are folded away first. The old A-ÿ class kept the Latin-1 ones
     and dropped everything above it, so a Vietnamese name lost the letters
     it was carrying a tone mark on and the monogram was built out of what
     survived — "Đội Bóng Hải Phòng" came out as IBÓ. Folding leaves the
     letter behind instead, and names that were already Latin-1 are
     unaffected: Curaçao is still CUR, Saint Lucia still SLU. */
  function monogram(name) {
    if (!name) return '???';
    var s = String(name);
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D');
    var clean = s.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return '???';                       // a name in a script with no Latin in it
    var parts = clean.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0] + (parts[1][1] || '')).toUpperCase();
    return clean.slice(0, 3).toUpperCase();
  }

  /* A channel's URL name. Two clubs called the same thing would collide
     on the unique index, so a short random tail is added rather than
     letting the insert fail in front of someone who just typed a name. */
  function slugify(name) {
    var s = String(name).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return (s || 'channel') + '-' + Math.random().toString(36).slice(2, 6);
  }

  function shapeClub(x) {
    if (!x) return null;
    return {
      id: x.id, slug: x.slug, name: x.name,
      crest: x.crest_text || monogram(x.name),
      competition: x.competition || '', stage: x.stage || '',
      sport: x.sport || 'football', country: x.country || '',
      createdBy: x.created_by || null, createdAt: x.created_at || null,
      role: null
    };
  }

  var ROLE_ORDER = ['admin', 'analyst', 'viewer'];

  /* Postgres speaks in error codes; these are the ones a person can act
     on. Anything else is passed through as it came, which is still more
     use than "something went wrong". */
  function asError(e) {
    var msg = (e && e.message) || 'The database refused that.';
    var code = (e && e.code) || '';
    if (code === '42P01' || /relation .* does not exist/i.test(msg))
      return new Error('Channels are not set up in this database yet — run supabase/migrations/0014_channel_admin.sql.');
    if (code === '42883' || /function .* does not exist/i.test(msg))
      return new Error('This database is missing the channel functions — run supabase/migrations/0014_channel_admin.sql.');
    if (code === '42501' || /row-level security|permission denied/i.test(msg))
      return new Error('Your account is not an admin of this channel.');
    if (code === '23505') return new Error('That already exists in this channel.');
    if (/must keep at least one admin/i.test(msg))
      return new Error('A channel must keep at least one admin — make someone else an admin first.');
    return new Error(msg);
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

    /* ---------- channels ----------
       select('*') rather than a column list on purpose: this file is
       served to a browser that may be talking to a database where
       0014 has not been run yet, and naming a column that does not
       exist there fails the whole query. Missing fields just come
       back undefined and the mapping below fills them in. */
    clubs: function () {
      var c = client();
      if (!c) return Promise.resolve([]);
      return c.from('clubs').select('*').order('name')
        .then(function (r) {
          if (r.error || !r.data) return [];
          var rows = r.data.map(shapeClub);
          /* which of them the signed-in person administers */
          return c.from('club_members').select('club_id,role')
            .then(function (m) {
              var role = {};
              ((m && m.data) || []).forEach(function (x) { role[x.club_id] = x.role; });
              rows.forEach(function (x) { x.role = role[x.id] || null; });
              return rows;
            })
            .catch(function () { return rows; });
        })
        .catch(function () { return []; });
    },

    /* ---------- running a channel ----------
       Everything here needs 0014_channel_admin.sql. Until it is run
       the calls reject with whatever Postgres said, and the UI shows
       that sentence rather than pretending the click did nothing. */
    channels: {
      create: function (fields) {
        var c = client();
        if (!c) return Promise.reject(new Error('The Supabase client did not load.'));
        var name = String(fields.name || '').trim();
        if (!name) return Promise.reject(new Error('Give the channel a name.'));
        var row = {
          slug: slugify(name),
          name: name,
          crest_text: (fields.crest ? String(fields.crest).trim().toUpperCase() : monogram(name)).slice(0, 4),
          sport: fields.sport || 'football',
          country: fields.country || null,
          competition: fields.competition || null,
          stage: fields.stage || null
        };
        return c.from('clubs').insert(row).select('*').single()
          .then(function (r) { if (r.error) throw asError(r.error); return shapeClub(r.data); });
      },

      /* Renaming and deleting a channel are not offered: 0014 leaves both
         with its admins, but nothing in the UI asks for them yet, and an
         API call no screen makes is an API call nobody has tried. */
      members: function (clubId) {
        var c = client();
        if (!c) return Promise.resolve([]);
        return c.from('club_members').select('*').eq('club_id', clubId)
          .then(function (r) {
            if (r.error) throw asError(r.error);
            return (r.data || []).map(function (m) {
              return {
                userId: m.user_id, role: m.role,
                email: m.email || '', name: m.display_name || '',
                addedAt: m.added_at || null
              };
            }).sort(function (a, b) {
              return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
                     String(a.email).localeCompare(String(b.email));
            });
          });
      },

      setRole: function (clubId, userId, role) {
        var c = client();
        if (!c) return Promise.reject(new Error('The Supabase client did not load.'));
        return c.from('club_members').update({ role: role })
          .eq('club_id', clubId).eq('user_id', userId)
          .then(function (r) { if (r.error) throw asError(r.error); return true; });
      },

      removeMember: function (clubId, userId) {
        var c = client();
        if (!c) return Promise.reject(new Error('The Supabase client did not load.'));
        return c.from('club_members').delete()
          .eq('club_id', clubId).eq('user_id', userId)
          .then(function (r) { if (r.error) throw asError(r.error); return true; });
      },

      invites: function (clubId) {
        var c = client();
        if (!c) return Promise.resolve([]);
        return c.from('club_invites').select('*')
          .eq('club_id', clubId).is('accepted_at', null)
          .order('created_at', { ascending: false })
          .then(function (r) {
            if (r.error) throw asError(r.error);
            return (r.data || []).map(function (i) {
              return { id: i.id, email: i.email, role: i.role, createdAt: i.created_at };
            });
          });
      },

      /* Records an invitation. It does not send anything — no mail
         leaves this app — the row waits until that address signs in
         and claim() turns it into a membership. */
      invite: function (clubId, email, role) {
        var c = client();
        if (!c) return Promise.reject(new Error('The Supabase client did not load.'));
        var mail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return Promise.reject(new Error('Enter a valid email address.'));
        return c.from('club_invites').insert({ club_id: clubId, email: mail, role: role || 'viewer' })
          .select('*').single()
          .then(function (r) {
            if (r.error) throw asError(r.error);
            return { id: r.data.id, email: r.data.email, role: r.data.role, createdAt: r.data.created_at };
          });
      },

      revokeInvite: function (inviteId) {
        var c = client();
        if (!c) return Promise.reject(new Error('The Supabase client did not load.'));
        return c.from('club_invites').delete().eq('id', inviteId)
          .then(function (r) { if (r.error) throw asError(r.error); return true; });
      },

      /* Run on every load: an invite written before this person had an
         account only becomes a membership once they do. Silent when the
         function is not there yet — a browser that cannot claim invites
         must still be able to open the app. */
      claim: function () {
        var c = client();
        if (!c) return Promise.resolve(0);
        return c.rpc('claim_club_invites')
          .then(function (r) { return (r && !r.error && r.data) || 0; })
          .catch(function () { return 0; });
      }
    },

    /* ---------- matches in a channel ---------- */
    matches: function (clubId) {
      var c = client();
      if (!c) return Promise.resolve([]);
      return c.from('matches')
        /* `code` — the 5-digit share code from 0002. It is NOT called
           match_code: that is the name of the trigger function that fills
           it in. Asking for a column that is not there fails the whole
           query, which is why this returned nothing at all. */
        .select('id,code,home_name,away_name,home_score,away_score,kickoff,competition,stage,venue,our_side,published,lineups')
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
            id: m.code || m.id,
            uuid: m.id,
            slug: String(m.code || m.id),
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
            /* the starting XI the tagger entered, as {roster,xi,subs,dir}
               per side — the Data view draws the most recent one */
            lineup: (m.lineups && m.lineups[side]) || null,
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
