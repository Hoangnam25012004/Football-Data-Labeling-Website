/* ============================================================
   Data layer for the client site.

   Talks to the same Supabase project the tagging app writes into,
   so a match tagged on the labeling site turns up here as soon as
   an analyst points it at a channel and publishes it.

   No session means no channel, and the app says so — there is no sample
   to fall back on. A missing view still leaves the matches readable,
   just without their aggregated numbers.
   ============================================================ */
(function (global) {
  'use strict';

  var CONFIG = {
    url: 'https://xtzmtdcohoixoxqusyyz.supabase.co',
    anonKey: 'sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa'
  };

  /* Where a confirmation link should come back to: this site's own sign-in
     page. Read off this script's own URL rather than off location — supa.js
     is loaded by app.html as often as by login.html, and a signed-up club
     following a link out of their inbox should land on the club's site, not
     wherever they happened to start. supa.js is served from assets/, so the
     site root is one level up. */
  var ROOT = (function () {
    try { return new URL('../', document.currentScript.src).href; } catch (e) {}
    try { return location.href.replace(/[^/]*(\?[^#]*)?(#.*)?$/, ''); } catch (e) {}
    return '';           // the test sandbox: no document, no location, no page to come back to
  })();

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
      isPublic: !!x.is_public,
      createdBy: x.created_by || null, createdAt: x.created_at || null,
      role: null
    };
  }

  var ROLE_ORDER = ['admin', 'analyst', 'viewer'];

  /* Whether this browser is reading as a signed-out visitor. Set once the
     session is known, and only used to pick which of the two stats views to
     read — everything else is decided by row-level security on the server. */
  var anonymous = true;

  /* Postgres speaks in error codes; these are the ones a person can act
     on. Anything else is passed through as it came, which is still more
     use than "something went wrong". */
  function asError(e, what) {
    var msg = (e && e.message) || 'The database refused that.';
    var code = (e && e.code) || '';
    if (code === '42P01' || /relation .* does not exist/i.test(msg))
      return new Error('Channels are not set up in this database yet — run supabase/migrations/0014_channel_admin.sql.');
    if (code === '42883' || /function .* does not exist/i.test(msg))
      return new Error('This database is missing the channel functions — run supabase/migrations/0014_channel_admin.sql.');
    if (code === '42501' || /row-level security|permission denied/i.test(msg))
      /* Every other call here is about a channel that already exists, where
         "not an admin" is the reason. Creating one is not: there is no admin
         of a channel that is not there yet, and saying so sent this bug
         looking in the wrong place for a week. */
      return new Error(what === 'create'
        ? 'The database would not let this account create a channel. Check that you are still signed in.'
        : 'Your account is not an admin of this channel.');
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
  /* The same date in a column rather than a sentence. A table of matches is
     read down the column, where the weekday and the spelt-out month are
     width the numbers could be using. */
  function shortDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
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
          .then(function (r) {
            var s = (r && r.data && r.data.session) || null;
            anonymous = !s;
            return s;
          })
          .catch(function () { anonymous = true; return null; });
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
      /* Creating an account, and nothing more. It joins no channel: a new
         account is in none, and which club someone belongs to is an admin's
         decision, taken by invitation (see channels.invite / claim). What
         comes back tells the caller which of the two happened — a session
         means the project lets new accounts straight in, no session means it
         has emailed them a confirmation link first. */
      signUp: function (email, password, name) {
        var c = client();
        if (!c) return Promise.reject(new Error('Sign-up is unavailable: the Supabase client did not load.'));
        return c.auth.signUp({
          email: email, password: password,
          options: { data: { full_name: name || '' }, emailRedirectTo: ROOT + 'login.html' }
        }).then(function (r) { if (r.error) throw r.error; return r.data || {}; });
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
      /* The session is read first because the membership query below needs
         the caller's own id to filter on, and getting it wrong is not a
         cosmetic matter — see the .eq() there. */
      return API.auth.session().catch(function () { return null; }).then(function (s) {
        var me = (s && s.user && s.user.id) || null;
        return c.from('clubs').select('*').order('name')
          .then(function (r) {
            if (r.error || !r.data) return [];
            var rows = r.data.map(shapeClub);
            /* A signed-out visitor is reading a public channel (0017). They hold
               no membership anywhere, so there is no role to look up and asking
               would only return nothing. */
            if (!me) return rows;
            /* Which role THIS account holds in each of them. The .eq is not
               optional: club_members_read lets anyone in a channel read every
               membership row of that channel, so without it the answer includes
               other people's roles — and the loop below keeps whichever arrived
               last. There is no ORDER BY, so which one that is, is not defined.
               An admin could be shown as a viewer and silently lose the invite
               form and the public switch, both of which are gated on this. */
            return c.from('club_members').select('club_id,role').eq('user_id', me)
              .then(function (m) {
                var role = {};
                ((m && m.data) || []).forEach(function (x) { role[x.club_id] = x.role; });
                rows.forEach(function (x) { x.role = role[x.id] || null; });
                return rows;
              })
              .catch(function () { return rows; });
          });
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
          country: fields.country || null
          /* competition / stage are deliberately not set. They belong to a
             match, not to a club — one club plays in several competitions, and
             the columns stay on public.clubs only because channels seeded
             before this still carry them. */
        };
        /* No .select() on the way back, and that is the whole point.
           Adding one makes the statement INSERT ... RETURNING, and Postgres
           then requires the new row to satisfy the SELECT policy before it
           will hand it over — clubs_read, which asks is_club_member(). The
           membership that makes that true is written by clubs_creator_admin,
           an AFTER INSERT trigger, and those fire at the END of the
           statement. So the row is refused by the very statement creating
           it: 42501, for everyone except staff, whose is_staff() short-
           circuits both policies. That is why this worked in development
           and for nobody else.

           Nothing is lost by not asking: the slug is built here, so the
           caller already knows how to find the channel once the trigger has
           run — and app.js re-reads the list anyway, because the role has to
           come from the membership the database made. */
        return c.from('clubs').insert(row)
          .then(function (r) {
            if (r.error) throw asError(r.error, 'create');
            return shapeClub(row);
          });
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

      /* Open the channel to anyone, or close it again. Only an admin of the
         channel gets past clubs_update, so the check is the database's, not
         this button's — but the UI asks first, because what it publishes is
         the whole report including the players' names. */
      setPublic: function (clubId, on) {
        var c = client();
        if (!c) return Promise.reject(new Error('The Supabase client did not load.'));
        return c.from('clubs').update({ is_public: !!on }).eq('id', clubId).select('*').single()
          .then(function (r) {
            if (r.error) throw asError(r.error);
            return shapeClub(r.data);
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
        .select('id,code,home_name,away_name,home_score,away_score,kickoff,competition,stage,venue,our_side,published,lineups,config')
        .eq('club_id', clubId).eq('published', true)
        .order('kickoff', { ascending: true })
        .then(function (r) {
          if (r.error || !r.data || !r.data.length) return [];
          var rows = r.data;
          var ids = rows.map(function (m) { return m.id; });
          /* match_stats is a view, so row-level security does not reach it and
           an anonymous visitor is kept off it entirely (0017). The narrowed
           one filters to public channels itself. */
        return c.from(anonymous ? 'public_match_stats' : 'match_stats').select('*').in('match_id', ids)
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
            /* the duration mapping, so a shot's video time can be shown as
               the minute it happened — the tagger keeps it on the match */
            dur: Object.assign({ enabled: false, halfLen: 45, h1Start: 0, h1End: 0, h2Start: 0, h2End: 0 },
                               m.config || {}),
            live: true
          };
        });
      }
    },

    /* ---------- the signed-off report for one match ----------
       One row, not eighteen hundred: the match as Submit Analysis froze it.
       This is the only thing the client site needs to draw the full Stats
       view, and it is why a club never needs read access to public.events.
       No report yet is not an error — it is a match nobody has submitted. */
    report: function (matchUuid) {
      var c = client();
      if (!c || !matchUuid) return Promise.resolve(null);
      return c.from('match_reports')
        .select('version,schema,payload,event_count,published_at')
        .eq('match_id', matchUuid)
        .order('version', { ascending: false })
        .limit(1)
        .then(function (r) {
          if (r.error) throw asError(r.error);
          var row = (r.data || [])[0];
          if (!row) return null;
          return {
            version: row.version, schema: row.schema,
            eventCount: row.event_count, publishedAt: row.published_at,
            payload: row.payload || null
          };
        });
    },

    /* ---------- every signed-off report in a channel, in one pass ----------
       The Data view adds up what analysts submitted, so it reads the same
       payloads the match page does — all of them, rather than one request
       per fixture.

       Ordered by version ASCENDING and written into the map as it goes, so
       the row that survives is the last one for that match: publishing again
       adds a version, it does not overwrite, and the newest is the one the
       club is being shown.

       Chunked because the ids travel in the URL and a payload is a whole
       match of events — twenty at a time keeps both the request line and the
       response inside anything sensible. */
    reports: function (matchUuids) {
      var c = client();
      var ids = (matchUuids || []).filter(Boolean);
      if (!c || !ids.length) return Promise.resolve({});
      var out = {}, chunks = [];
      for (var i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
      return chunks.reduce(function (p, chunk) {
        return p.then(function () {
          return c.from('match_reports')
            .select('match_id,version,payload')
            .in('match_id', chunk)
            .order('version', { ascending: true })
            .then(function (r) {
              if (r.error) throw asError(r.error);
              (r.data || []).forEach(function (row) {
                if (row.payload) out[row.match_id] = row.payload;
              });
            });
        });
      }, Promise.resolve()).then(function () { return out; });
    }
  };


  API.monogram = monogram;
  API.dateLabel = dateLabel;
  API.shortDate = shortDate;
  global.HNA = API;
})(window);
