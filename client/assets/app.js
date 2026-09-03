/* ============================================================
   Client app — channels, matches, data, players.

   A channel is a club. Channels come from Supabase, and only for a
   signed-in account that belongs to one — there is no sample to fall
   back on, so "no channel" is a state the app says out loud.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, c, h) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (h != null) n.innerHTML = h;
    return n;
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function num(v) { return v == null ? '—' : v; }

  /* `reports` is the Data view's source: every payload Submit Analysis froze
     in this channel, keyed by match uuid, read once and kept. `reportsFor`
     names the channel they belong to, so switching club cannot leave last
     club's numbers on the screen. */
  var state = { user: null, channels: [], channel: null, matches: [], loading: true,
                reports: null, reportsFor: null };

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function boot() {
    var ready = (window.HNA && window.HNA.configured())
      ? window.HNA.auth.user().catch(function () { return null; })
      : Promise.resolve(null);

    ready.then(function (user) {
      state.user = user;
      /* Signed out is no longer the end of it: a channel whose admin has made
         it public is readable by anyone, so the list is asked for either way
         and row-level security decides what comes back. */
      if (!user) return window.HNA.clubs();
      /* An invite written before this person had an account only turns
         into a membership once they sign in, so it is claimed before the
         channel list is read — otherwise the channel they were invited
         to would not appear until the next load. */
      return window.HNA.channels.claim().then(function () { return window.HNA.clubs(); });
    }).then(function (clubs) {
      state.channels = clubs || [];
      var wanted = new URLSearchParams(location.search).get('club');
      state.channel = state.channels.filter(function (c) { return c.slug === wanted; })[0]
                   || state.channels[0] || null;
      return loadMatches(state.channel);
    }).then(function () {
      state.loading = false;
      renderShell();
      route();
    }).catch(function (err) {
      /* No channel is a state the app has to be able to sit in: signed out, or
         signed in and not yet invited to one. There is nothing to fall back on. */
      state.loading = false;
      state.channels = []; state.channel = null; state.matches = [];
      renderShell();
      route();
      if (window.console) console.warn('No channel could be opened:', err);
    });
  }

  function loadMatches(ch) {
    /* A different channel is a different campaign: drop what was added up
       for the last one rather than letting the Data view find it cached. */
    state.reports = null; state.reportsFor = null; reportJob = null; playerJob = null;
    if (!ch) { state.matches = []; return Promise.resolve(); }
    /* The channel's team code goes with the id: with one, which side of a
       fixture is the club's own is answered by the match rather than by the
       our_side somebody set on the tagging side. */
    return window.HNA.matches(ch.id, ch.code).then(function (rows) {
      state.matches = rows || [];
    }).catch(function () { state.matches = []; });
  }

  /* ---------------------------------------------------------
     Shell: channel switcher, account, nav
     --------------------------------------------------------- */
  function renderShell() {
    var ch = state.channel;
    $('#chanName').textContent = ch ? ch.name : (state.user ? 'No channel' : 'Not signed in');

    var menu = $('#chanMenu');
    menu.innerHTML = '';
    state.channels.forEach(function (c) {
      var b = el('button', 'chan-opt' + (c === ch ? ' on' : ''),
        '<span>' + esc(c.name) + '<em>' + esc(c.country || 'channel') + '</em></span>');
      b.type = 'button';
      b.addEventListener('click', function () {
        state.channel = c;
        $('#chanWrap').classList.remove('open');
        loadMatches(c).then(function () { renderShell(); location.hash = '#/home'; route(); });
      });
      menu.appendChild(b);
    });

    var who = $('#who');
    if (state.user) {
      who.innerHTML = 'Signed in as<b>' + esc(state.user.email || 'account') + '</b>';
      $('#avatar').textContent = (state.user.email || 'A').charAt(0).toUpperCase();
      $('#signOut').hidden = false;
      $('#signIn').hidden = true;
    } else {
      who.innerHTML = 'Not signed in<b>sign in to open your channel</b>';
      $('#avatar').textContent = '?';
      $('#signOut').hidden = true;
      $('#signIn').hidden = false;
    }

  }

  /* ---------------------------------------------------------
     Routing
     --------------------------------------------------------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, '') || 'home';
    var parts = h.split('/');

    /* The rail said Matches where it now says Home. Bookmarks, the links
       in the marketing page and anything already open still say #/matches,
       and none of them should land on a blank screen. */
    if (parts[0] === 'matches') { location.replace('#/home'); return; }

    /* One match is still the Home section, so the rail stays lit on Home
       while a match is open. Players has no rail entry any more but the
       route is kept: it is reachable from the Data view. */
    var lit = (parts[0] === 'match' || parts[0] === 'players') ? 'home' : parts[0];
    document.querySelectorAll('.side a[data-view]').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === lit);
    });

    var view = $('#view');
    /* Film holds a video, an animation loop and four listeners on `document`.
       Emptying #view takes the elements away but not any of that: the video
       goes on playing where nobody can see it, and Space on the next page is
       still swallowed by a player that is no longer on screen.

       stats-view.js has always had the answer — destroy() calls filmStop() —
       and this is the one caller that was missing. Guarded on the holder rather
       than on a flag, because a match navigated away from before its report
       arrived has a holder and no mount, and destroy() has to be safe there
       too. */
    if (window.PTStats && window.PTStats.destroy && $('.pt-stats')) window.PTStats.destroy();
    view.innerHTML = '';
    if (parts[0] === 'match' && parts[1]) {
      var slug = decodeURIComponent(parts[1]);
      /* The one suffix that means something else. Anything else after the slug
         — /stats, from when there were two tabs — still lands on the analysis,
         which is the one page there is now. */
      if (parts[2] === 'edit') return renderMatchEdit(view, slug);
      return renderMatchStats(view, slug);
    }
    if (parts[0] === 'channel') return renderChannel(view, parts.slice(1));
    if (parts[0] === 'data') return renderData(view);
    if (parts[0] === 'players') return renderPlayers(view);
    return renderMatches(view);
  }

  /* ---------------------------------------------------------
     View: matches
     --------------------------------------------------------- */
  function renderMatches(view) {
    if (!state.channel) return view.appendChild(noChannel());

    /* No count beside the title: the list underneath is the count. */
    view.appendChild(head('Matches',
      state.matches.length ? '' : 'Nothing published in this channel yet'));

    if (!state.matches.length) {
      view.appendChild(emptyState('No matches published yet',
        'Once an analyst sends a tagged match over to this channel with Submit Analysis, ' +
        'it appears here.'));
      return;
    }

    /* The fixture is three columns, not one: who was at home, what it
       finished, who was away. Reading down a column then answers a question
       the old single cell could not — every home side, or every scoreline. */
    /* Only an admin of this channel may change what a match says about itself.
       This hides the control; the hedge that matters is 0023's matches_update,
       which refuses the write whatever the browser thinks. */
    var mayEdit = !!(state.user && state.channel && state.channel.role === 'admin');

    var list = el('div', 'mlist');
    /* Each heading sits over the edge its column reads from: Home ends where the
       home name ends, Away starts where the away name starts. The trailing empty
       span is the ⋯ column: without it the five headings sit over five columns
       that are no longer the whole row. */
    list.appendChild(el('div', 'mlist-h',
      '<span>Date</span><span style="text-align:right">Home</span>' +
      '<span style="text-align:center">Final score</span>' +
      '<span>Away</span><span>Details</span><span style="text-align:right">Result</span>'));

    state.matches.forEach(function (m) {
      /* The row is still a plain button — keyboard-reachable for free, no
         hand-rolled role and no hand-rolled key handling. The ⋯ is its SIBLING
         inside .mrow-wrap rather than a second control inside it: a <button>
         may not contain a <button>, and this page has been round that loop once
         already (see the note this comment replaced). */
      var wrap = el('div', 'mrow-wrap');
      var b = el('button', 'mrow');
      b.type = 'button';
      var ourHome = m.side === 'home';
      /* The date cell is the date, which side of the fixture was ours, and the id
         — what it said before there was anything else to say. League, season,
         round and the ground are a description of the FIXTURE and read in their
         own column beside it, rather than as a fifth and sixth clause here. */
      b.innerHTML =
        '<span class="m-date">' + esc(m.dateLabel) +
          '<em>' + (ourHome ? 'Home' : 'Away') + ' · Match ID ' + esc(m.id) + '</em></span>' +
        '<span class="m-team m-home">' +
          '<span class="tn' + (ourHome ? ' us' : '') + '">' + esc(m.home.name) + '</span>' +
        '</span>' +
        '<span class="m-sc"><span class="m-score">' +
          num(m.home.score) + ' : ' + num(m.away.score) + '</span></span>' +
        '<span class="m-team m-away">' +
          '<span class="tn' + (ourHome ? '' : ' us') + '">' + esc(m.away.name) + '</span>' +
        '</span>' +
        detailsCell(m) +
        '<span class="m-end">' +
          (m.result ? '<span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span>' : '') +
          '<span class="m-open" aria-hidden="true">' +
            '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M1 0 9 5 1 10Z"/></svg>' +
          '</span>' +
        '</span>';
      b.addEventListener('click', function () {
        location.hash = '#/match/' + encodeURIComponent(m.slug || m.id);
      });
      wrap.appendChild(b);
      if (mayEdit) wrap.appendChild(matchMenu(m));
      list.appendChild(wrap);
    });
    view.appendChild(list);

    /* ONE listener for the whole list, not one per menu. settingsMenu() hangs a
       document listener because it is the only menu on its page; there is a menu
       per match here, and forty matches would be forty listeners on `document`,
       each holding a detached row alive after the next channel is drawn. This
       one goes away with #view, which route() empties. */
    if (mayEdit) {
      document.addEventListener('click', function away(e) {
        if (!list.isConnected) { document.removeEventListener('click', away); return; }
        var inside = e.target.closest ? e.target.closest('.mrow-wrap .menu-wrap') : null;
        list.querySelectorAll('.menu-wrap.open').forEach(function (w) {
          if (w === inside) return;
          w.classList.remove('open');
          var t = w.querySelector('.mrow-more');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* What a channel has said about a fixture, in the column beside it: the
     competition on the top line and the ground under it.

     Every part is dropped when empty, and a match nobody has described yet gets
     an empty cell rather than a row of dashes — three "—" would be three marks
     saying the same nothing, and the heading above already says what the column
     is for. Filling it in is the ⋯ menu's Edit. */
  function detailsCell(m) {
    var top = [m.league, m.season, m.round].filter(Boolean)
      .map(function (s) { return '<b>' + esc(s) + '</b>'; })
      .join('<i class="m-det-sep" aria-hidden="true"></i>');
    var venue = m.venue ? '<em>' + esc(m.venue) + '</em>' : '';
    return '<span class="m-det">' + (top ? '<span class="m-det-top">' + top + '</span>' : '') +
           venue + '</span>';
  }

  /* The ⋯ beside one match row. Built out of the same menu-wrap / menu /
     menu-opt the channel Settings menu and the player dropdown are, so it
     inherits their styling and their behaviour without a class of its own.

     It hangs no document listener: renderMatches() keeps one for the whole
     list. */
  function matchMenu(m) {
    var wrap = el('span', 'menu-wrap');
    var btn = el('button', 'mrow-more', '<span aria-hidden="true">⋯</span>');
    btn.type = 'button';
    btn.title = 'More';
    btn.setAttribute('aria-label', 'More for ' + (m.home.name + ' v ' + m.away.name));
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    var menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    var edit = el('button', 'menu-opt', 'Edit<em>Date, league, season, round</em>');
    edit.type = 'button';
    edit.addEventListener('click', function () {
      location.hash = '#/match/' + encodeURIComponent(m.slug || m.id) + '/edit';
    });
    menu.appendChild(edit);

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    /* No stopPropagation, and that is deliberate. The ⋯ is a SIBLING of the row
       button rather than a child, so a click on it never passes through the row
       and cannot open the match. Stopping the event would only keep it from
       reaching the list's own listener — which is the thing that closes whichever
       other menu was left open. */
    btn.addEventListener('click', function () {
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    return wrap;
  }

  /* Signed out, or signed in and not in a channel yet. There is nothing to
     show and nothing to fall back on, so say which of the two it is. */
  function noChannel() {
    if (!state.user) {
      var s = emptyState('Not signed in',
        'Your club\'s matches, data and players live in a channel. Sign in to open yours — ' +
        'or follow a link to one its admin has made public.');
      var a = el('a', 'btn btn-primary', 'Sign in');
      a.href = 'login.html';
      s.appendChild(a);
      return s;
    }
    return emptyState('No channel yet',
      'This account is not in a channel. Create one under Channel, or ask whoever runs ' +
      'your club\'s channel to invite this email address.');
  }

  /* ---------------------------------------------------------
     View: one match, the full analysis

     The same view the analyst uses, fed a published report instead of a live
     database. Everything it can do there it can do here — three views, both
     sides, the four categories, the maps and the exports — because it is the
     same file, not a second version of it.
     --------------------------------------------------------- */
  function renderMatchStats(view, slug) {
    var m = state.matches.filter(function (x) { return String(x.slug || x.id) === slug; })[0];
    if (!m) { location.hash = '#/home'; return; }

    var back = el('button', 'back', '&larr; All matches');
    back.addEventListener('click', function () { location.hash = '#/home'; });
    view.appendChild(back);

    var holder = el('div', 'pt-stats');
    holder.innerHTML = '<div class="state" style="border:0"><div class="spinner"></div>' +
      '<b>Opening the analysis</b><p>One moment.</p></div>';
    view.appendChild(holder);

    Promise.all([loadStatsView(), window.HNA.report(m.uuid)]).then(function (r) {
      if (!holder.parentNode) return;          // someone navigated on while this loaded
      var rep = r[1];
      holder.innerHTML = '';
      if (!rep || !rep.payload) {
        holder.appendChild(emptyState('No analysis submitted yet',
          'An analyst sends a match over from the labeling site once they have finished ' +
          'with it. It appears here the moment they do.'));
        return;
      }
      /* {fullscreen:true}: a club watches this on a projector, with the squad in
         the room, so Film gets the control that fills the screen with it.
         {guide}: and the way out to the documentation, under the transport bar.
         Both are the host asking; the analyst's own Stats page mounts without
         either and is unchanged. The href is written against THIS document, so
         it resolves beside app.html on the live site and in client/ locally. */
      window.PTStats.mount(holder, rep.payload,
        { fullscreen: true, guide: 'guide.html' });
      /* the PDF button is part of the chrome that mount() just drew, so it did
         not exist when report.js ran */
      if (window.PTReport && window.PTReport.bind) window.PTReport.bind();
      /* A ?t= link names a second of the video, so it means Film — and Film is
         not the tab a fresh page opens on. The button mount() just drew is the
         one place that knows how to change view, so it is pressed rather than
         reached around; film-tools.js does the seeking once it is attached. */
      if (/[?&]t=\d/.test(location.search)) {
        var film = document.getElementById('viewFilmBtn');
        if (film) film.click();
      }
    }).catch(function (e) {
      if (!holder.parentNode) return;
      holder.innerHTML = '';
      holder.appendChild(emptyState('The analysis could not be opened',
        (e && e.message) || String(e)));
    });
  }

  /* ---------------------------------------------------------
     View: one match, the four things a channel may say about it

     A route rather than a dialog, the way editing a channel is one. It can be
     linked to, Back leaves it, and #view is emptied on the way out so nothing
     of it is left hanging about.
     --------------------------------------------------------- */
  /* Every (league, season) pair already used in this channel, newest first.
     Two jobs: the datalists below, so re-using a spelling is easier than typing
     a new one, and the line under the Team stats card on the Overview. */
  function seasonsOf(matches) {
    var seen = {}, out = [];
    (matches || []).forEach(function (m) {
      var lg = m.league || '', sn = m.season || '';
      if (!lg && !sn) return;
      var k = lg + '\u0000' + sn;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ league: lg, season: sn });
    });
    return out;
  }
  function valuesOf(matches, field) {
    var seen = {}, out = [];
    (matches || []).forEach(function (m) {
      var v = m[field] || '';
      if (!v || seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out.sort();
  }

  function renderMatchEdit(view, slug) {
    var m = state.matches.filter(function (x) { return String(x.slug || x.id) === slug; })[0];
    if (!m) { location.hash = '#/home'; return; }
    var backTo = function () { location.hash = '#/home'; };

    var back = el('button', 'back', '&larr; All matches');
    back.addEventListener('click', backTo);
    view.appendChild(back);
    view.appendChild(head('Edit match',
      m.home.name + ' v ' + m.away.name + ' · Match ID ' + m.id));

    /* The same shape renderChannelEdit takes: say who may do this rather than
       drawing a form whose Save is going to be refused. 0023's matches_update
       is the guarantee; this is the courtesy. */
    if (!state.channel || state.channel.role !== 'admin') {
      view.appendChild(emptyState('Not an admin of this channel',
        'Only an admin can change what a match says about itself. Ask whoever runs this channel.'));
      return;
    }

    matchForm(view, {
      values: m,
      cancel: backTo,
      save: function (fields) {
        return window.HNA.match.update(m.uuid, fields).then(function () {
          /* Read the channel back rather than patching state.matches with what
             was just sent: the database has triggers, defaults and column-level
             grants, and what it kept is the only thing worth drawing. It also
             drops state.reports, so the Data view adds the campaign up again
             instead of redrawing a cached one. */
          return loadMatches(state.channel).then(function () {
            location.hash = '#/home';
            route();                              // same hash: nothing would redraw on its own
          });
        });
      }
    });
  }

  /* Four fields, and only four. Nothing here can touch a score, a result or
     whether the match is published — 0023 grants UPDATE on five columns and no
     others, so a fifth would be refused by Postgres rather than written quietly. */
  function matchForm(view, opts) {
    var v = opts.values || {};
    var leagues = valuesOf(state.matches, 'league');
    var seasons = valuesOf(state.matches, 'season');
    var rounds = valuesOf(state.matches, 'round');
    var venues = valuesOf(state.matches, 'venue');
    var options = function (list) {
      return list.map(function (s) { return '<option value="' + esc(s) + '"></option>'; }).join('');
    };
    var card = el('div', 'card form-card');
    card.innerHTML =
      '<form id="matchForm">' +
        '<div class="field"><label for="meDate">Date</label>' +
          '<input id="meDate" type="date" value="' + esc(v.date || '') + '">' +
          '<p class="field-note">The day the match was played. Clearing it leaves the ' +
            'fixture undated, which is what it reads as now.</p></div>' +
        '<div class="f2">' +
          '<div class="field"><label for="meLeague">League <span class="opt">optional</span></label>' +
            '<input id="meLeague" list="meLeagueList" autocomplete="off" value="' + esc(v.league || '') + '">' +
            '<datalist id="meLeagueList">' + options(leagues) + '</datalist></div>' +
          '<div class="field"><label for="meSeason">Season <span class="opt">optional</span></label>' +
            '<input id="meSeason" list="meSeasonList" autocomplete="off" value="' + esc(v.season || '') + '">' +
            '<datalist id="meSeasonList">' + options(seasons) + '</datalist></div>' +
        '</div>' +
        '<div class="f2">' +
          '<div class="field"><label for="meRound">Round <span class="opt">optional</span></label>' +
            '<input id="meRound" list="meRoundList" autocomplete="off" placeholder="Round 3" value="' +
              esc(v.round || '') + '">' +
            '<datalist id="meRoundList">' + options(rounds) + '</datalist>' +
            '<p class="field-note">Whatever this competition calls it — Round 3, ' +
              'Matchday 12, Quarter-final.</p></div>' +
          '<div class="field"><label for="meVenue">Venue <span class="opt">optional</span></label>' +
            '<input id="meVenue" list="meVenueList" autocomplete="off" value="' +
              esc(v.venue || '') + '">' +
            '<datalist id="meVenueList">' + options(venues) + '</datalist>' +
            '<p class="field-note">The ground it was played on. Whether the fixture was ' +
              'home or away is read off the teams, not off this.</p></div>' +
        '</div>' +
        '<div class="form-end">' +
          '<button class="btn btn-primary" type="submit" id="meGo">Save changes</button>' +
          '<button class="btn btn-quiet" type="button" id="meCancel">Cancel</button>' +
          '<span class="form-msg" id="meMsg"></span>' +
        '</div>' +
      '</form>';
    view.appendChild(card);
    /* The three lists are what this channel has already used. Nothing is
       normalised on save: "Bepro League" and "Bepro league" would be two rows on
       a player's Season table, and the fix for that is making the spelling you
       already used the easy one to pick — not quietly rewriting what was typed,
       which a competition that really does differ by case cannot recover from. */
    view.appendChild(el('p', 'note',
      'League, Season and Round come from the match rather than from the channel — a club ' +
      'plays in several over a season. Anything left blank reads "—" wherever it is shown, ' +
      'and the boxes suggest what this channel has already used.'));

    card.querySelector('#meCancel').addEventListener('click', opts.cancel);
    card.querySelector('#matchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var go = card.querySelector('#meGo'), msg = card.querySelector('#meMsg');
      go.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = 'Saving…';
      var day = card.querySelector('#meDate').value || '';
      opts.save({
        /* Both date columns. shape() reads `kickoff || match_date` while the
           tagging app reads match_date, so writing one of them would leave the
           two sites showing different days for the same match. */
        kickoff: day,
        match_date: day,
        league: card.querySelector('#meLeague').value,
        season: card.querySelector('#meSeason').value,
        round: card.querySelector('#meRound').value,
        venue: card.querySelector('#meVenue').value
      }).catch(function (err) {
        go.disabled = false;
        msg.className = 'form-msg err';
        msg.textContent = err.message || String(err);
      });
    });
  }

  /* ---------------------------------------------------------
     View: data (campaign aggregates)

     Three sections behind one heading:

       Overview     what the campaign came to — the record, the last five
                    results, who put the numbers on the board
       Team Data    one row per match, four categories of columns
       Player Data  the same reports cut by the man rather than by the match

     All three are worked out from the reports Submit Analysis froze, through
     the same computeStats()/sumTeam()/TEAM_SECTIONS/PLAYER_CATS shared.js
     gives the match page. That is the whole point: a figure here and the same
     figure on the match page come out of one implementation, so they cannot
     drift apart.

     Which section is open lives in the hash — #/data/team/defensive is a
     link somebody can send — so route() redraws on a tab click and the
     signature stays renderData(view).
     --------------------------------------------------------- */
  /* Each row does double duty: the key is a PLAYER_CATS category (Player Data) AND the
     third field names a TEAM_SECTIONS section (Team Data). Both halves are looked up by
     value, and a miss draws an EMPTY TABLE rather than throwing — so a key or a title
     that no longer exists in shared.js fails silently. The test beside this checks every
     one of them against shared.js for exactly that reason. */
  var TD_TABS = [
    /* key, what the tab says, which of shared.js's TEAM_SECTIONS it draws */
    ['shooting',     'Shooting',     'Attacking Stats'],
    ['distribution', 'Distribution', 'Distribution Stats'],
    ['defensive',    'Defensive',    'Defensive Stats'],
    ['goalkeeper',   'Goalkeeper',   'Goalkeeper Stats'],
    ['setPieces',    'Set Pieces',   'Set Piece Stats'],
    ['fouls',        'Fouls',        'Fouls & Discipline']
  ];

  function renderData(view) {
    if (!state.channel) return view.appendChild(noChannel());

    var rest = location.hash.replace(/^#\/?/, '').split('/').slice(1);
    var onTeam = rest[0] === 'team';
    var cat = onTeam && TD_TABS.some(function (t) { return t[0] === rest[1]; }) ? rest[1] : 'shooting';
    /* Player Data carries two more segments — which player, then which
       category — so it reads its own, and Team Data's line above is left to
       mean exactly what it always meant. */
    var onPlayer = rest[0] === 'player';

    /* No strapline: the tabs under the title say what the page is, and
       head() draws nothing where there is nothing to say. */
    view.appendChild(head('Data'));
    view.appendChild(dataTabs(onPlayer ? 'player' : onTeam ? 'team' : 'overview'));

    if (!state.matches.length) {
      view.appendChild(emptyState('Nothing to add up yet',
        'Aggregates appear once there is at least one published match in this channel.'));
      return;
    }

    var body = el('div', 'dbody');
    body.innerHTML = '<div class="state" style="border:0"><div class="spinner"></div>' +
      '<b>Adding up the campaign</b><p>Reading every analysis submitted to this channel.</p></div>';
    view.appendChild(body);

    dataSource().then(function () {
      if (!body.parentNode) return;              // someone navigated on while this loaded
      body.innerHTML = '';
      if (onPlayer) renderPlayerData(body, rest);
      else if (onTeam) renderTeamData(body, cat); else renderOverview(body);
    }).catch(function (e) {
      if (!body.parentNode) return;
      body.innerHTML = '';
      body.appendChild(emptyState('The submitted analyses could not be read',
        (e && e.message) || String(e)));
    });
  }

  function dataTabs(open) {
    var bar = el('div', 'dtabs');
    [['overview', 'Overview'], ['team', 'Team Data'], ['player', 'Player Data']].forEach(function (t) {
      var b = el('button', 'dtab' + (t[0] === open ? ' on' : ''), t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { location.hash = '#/data/' + t[0]; });
      bar.appendChild(b);
    });
    return bar;
  }

  /* The same four category chips on both tables — the columns underneath them
     are the same four subjects either way. `base` is what a click lands on, so
     Team Data keeps its own route and a player keeps his. */
  /* `base` is what the category key is hung off. Player Data passes his own route
     and its own tab strip; Team Data passes nothing and builds the same href it
     always did. There is no third segment any more — the role used to be hung
     after the category so that clicking through to Defensive did not throw a man
     back to his default role, and a role is no longer something to keep. */
  function catTabs(cat, base, tabs) {
    var bar = el('div', 'dsubs');
    (tabs || TD_TABS).forEach(function (t) {
      var b = el('button', 'chip' + (t[0] === cat ? ' on' : ''), t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { location.hash = (base || '#/data/team/') + t[0]; });
      bar.appendChild(b);
    });
    return bar;
  }

  /* Both halves of the view need shared.js's stat engine and every report in
     the channel. Fetched once per channel and kept: switching tab redraws
     from what is already here rather than asking again, and two quick
     clicks share the one in-flight request. */
  var reportJob = null;
  function dataSource() {
    var ch = state.channel;
    if (state.reportsFor === ch.id && state.reports) return Promise.resolve(state.reports);
    if (reportJob && reportJob.forChannel === ch.id) return reportJob;

    var job = Promise.all([
      loadShared(),
      window.HNA.reports(state.matches.map(function (m) { return m.uuid; }))
    ]).then(function (r) {
      state.reports = r[1] || {};
      state.reportsFor = ch.id;
      return state.reports;
    }).catch(function (e) {
      reportJob = null;                          // so leaving and coming back retries
      throw e;
    });
    job.forChannel = ch.id;
    reportJob = job;
    return job;
  }

  /* One match, reduced to what every table and card below reads. `us` and
     `them` are the two team columns; `players` is the club's own side broken
     out by shirt number, which is what Key Players ranks.

     shared.js is a classic script: its function declarations (sumTeam,
     computeStats, squadNames, newStat) land on window, while its top-level
     consts (pct, playerLabel, TEAM_SECTIONS) live only in the global lexical
     scope, where a bare name still reaches them. Nothing here runs before
     dataSource() has resolved, so both kinds are there. */
  function aggregate(m) {
    var rep = (state.reports || {})[m.uuid];
    if (!rep || !Array.isArray(rep.rows) || !rep.rows.length) return null;
    var other = m.side === 'home' ? 'away' : 'home';
    /* Named, because two fields below are read off it: the per-player tallies
       themselves, and the cards they now carry. */
    var players = window.computeStats(rep.rows, m.side);
    return {
      m: m,
      gf: (m.side === 'home' ? m.home.score : m.away.score) || 0,
      ga: (m.side === 'home' ? m.away.score : m.home.score) || 0,
      us: window.sumTeam(rep.rows, m.side),
      them: window.sumTeam(rep.rows, other),
      players: players,
      names: window.squadNames(rep.lineups || {}, m.side),
      /* Who was on the pitch and for how long, and who was booked — the two
         things a player's own page needs that a team total cannot carry.
         Read here, where a match is reduced once, rather than in the view:
         both are pure functions of the report and neither writes to it.
         `mins` is null for a match nobody entered a line-up for. */
      mins: window.playedMinutes(rep.lineups || {}, rep.dur || {}, m.side, rep.rows),
      cards: playerCards(players),
      /* Which squad entries name a players row, so the 14 of one window and the
         9 of the next can be recognised as one man; and who kept goal, with what
         went in past him while he was on the pitch. */
      ids: window.squadIds(rep.lineups || {}, m.side),
      gk: gkFigures(rep.rows, rep.lineups || {}, m.side),
      /* Which square of the formation board — the only thing that says what JOB
         he did that match. Read here, where a match is reduced exactly once,
         beside gk because it comes off the same board. */
      pos: posFigures(rep.lineups || {}, m.side)
    };
  }
  function aggregates() {
    return state.matches.map(aggregate).filter(Boolean);
  }
  /* Add a set of matches up into one stat object. The column functions in
     TEAM_SECTIONS then work on the campaign exactly as they work on a match —
     including the percentages, which come out as one ratio of totals rather
     than a mean of ratios. */
  function totalOf(aggs, which) {
    var t = window.newStat();
    aggs.forEach(function (a) {
      var s = a[which];
      for (var k in t) t[k] += (s[k] || 0);
    });
    return t;
  }

  /* ---------- Overview ---------- */
  function renderOverview(body) {
    var all = state.matches;
    var played = all.filter(function (m) { return m.result; });
    var w = played.filter(function (m) { return m.result === 'W'; }).length;
    var d = played.filter(function (m) { return m.result === 'D'; }).length;
    var l = played.filter(function (m) { return m.result === 'L'; }).length;
    var gf = 0, ga = 0;
    played.forEach(function (m) {
      gf += (m.side === 'home' ? m.home.score : m.away.score) || 0;
      ga += (m.side === 'home' ? m.away.score : m.home.score) || 0;
    });
    var avg = function (t) { return played.length ? Math.round(t / played.length * 10) / 10 : null; };

    var cards = discipline(all);
    /* Two rows of four on the one grid. The second row used to be three wide,
       so nothing in it lined up with anything in the row above it. */
    /* What campaign these totals ARE. Overview adds every match in the channel
       up, so with two competitions in it "Average goals scored" is a mean across
       both — and until now nothing on the page said so. One pair is named; more
       than one is counted, because listing four of them in a card heading is a
       list, not a heading. Nothing said, nothing drawn. */
    var pairs = seasonsOf(state.matches);
    var span = pairs.length === 1
      ? [pairs[0].league, pairs[0].season].filter(Boolean).join(' · ')
      : (pairs.length > 1 ? pairs.length + ' competitions' : '');

    var stat = el('div', 'card stat-card');
    stat.innerHTML =
      '<p class="card-h">Team stats <span class="right">' + esc(state.channel ? state.channel.name : '') + '</span></p>' +
      (span ? '<p class="card-sub">' + esc(span) + '</p>' : '') +
      '<div class="tstats">' +
        tstat('Total', played.length) + tstat('Win', w) + tstat('Draw', d) + tstat('Loss', l) +
      '</div>' +
      '<div class="tstats sec">' +
        tstat('Average goals scored', avg(gf)) +
        tstat('Average goals conceded', avg(ga)) +
        tstat('Yellow cards', cards.yellow) +
        tstat('Red cards', cards.red) +
      '</div>';
    body.appendChild(stat);
    /* Both full width. The pitch that used to sit beside this one is gone, and
       nothing here is narrow enough to want half a row: the results card is
       two team names, two scores and a date. */
    body.appendChild(recentResultsCard(played));

    var aggs = aggregates();
    body.appendChild(keyPlayersRow(aggs));

    if (!aggs.length) {
      body.appendChild(el('p', 'note',
        'Campaign totals appear once a match in this channel has been sent over with Submit Analysis.'));
      return;
    }

    var S = totalOf(aggs, 'us'), O = totalOf(aggs, 'them');
    var kpis = el('div', 'kpis six');
    kpis.innerHTML =
      kpi('Matches tagged', aggs.length, 'of ' + all.length + ' in this channel') +
      kpi('Goals for', gf, 'across the campaign') +
      kpi('Goals against', ga, 'goal difference ' + (gf - ga > 0 ? '+' : '') + (gf - ga)) +
      kpi('Shots', S.totalShots, S.shotsOn + ' on target') +
      kpi('Passes', S.passes, pct(S.passesComp, S.passes) + ' completed') +
      kpi('Possession', pct(S.passes, S.passes + O.passes), 'share of the ball');
    body.appendChild(kpis);
  }

  /* Cards are the one thing on the stats card that newStat() does not carry, so
     they are counted off the rows instead — through shared.js's classifyCards(),
     which is what the match timeline reads, so the campaign cannot disagree with
     the match it came from. A second yellow IS a yellow and IS a sending-off, and
     an explicit red tagged for that same dismissal is not a second red.

     Null, not zero, while no analysis has been submitted: a channel with nothing
     read yet has no discipline record, and 0 would claim it had a clean one. */
  function discipline(matches) {
    var y = 0, r = 0, seen = 0;
    matches.forEach(function (m) {
      var rep = (state.reports || {})[m.uuid];
      if (!rep || !Array.isArray(rep.rows) || !rep.rows.length) return;
      seen++;
      window.classifyCards(rep.rows).forEach(function (kind, row) {
        if (row.team !== m.side) return;             // the club's own side only
        if (kind === 'yc') y++;
        else if (kind === 'y2') { y++; r++; }        // the second yellow, and the red it is
        else if (kind === 'rc') r++;
      });
    });
    return seen ? { yellow: y, red: r } : { yellow: null, red: null };
  }

  /* The last five, most recent first — the list is kept in kickoff order for
     the fixture list, which reads the other way round. */
  function recentResultsCard(played) {
    var recent = played.slice().reverse().slice(0, 5);
    var res = el('div', 'card res-card');
    res.innerHTML = '<p class="card-h">Recent match results <span class="right">latest ' + recent.length + '</span></p>';
    var rl = el('div', 'rlist');
    if (!recent.length) {
      res.appendChild(el('p', 'note', 'No match in this channel has a final score yet.'));
      return res;
    }
    /* Six cells, and the two ends are the same width, so the scoreline lands on
       the middle of the row rather than wherever the date happened to push it.
       The home name reads right, into the score; the away name reads left, out
       of it — the fixture is one centred block either side of the result. */
    recent.forEach(function (m) {
      var b = el('button', 'rrow');
      b.type = 'button';
      b.innerHTML =
        '<span class="rres"><span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span></span>' +
        '<span class="rn rn-h' + (m.side === 'home' ? ' us' : '') + '">' + esc(m.home.name) + '</span>' +
        '<span class="rsc">' + num(m.home.score) + '</span>' +
        '<span class="rsc">' + num(m.away.score) + '</span>' +
        '<span class="rn rn-a' + (m.side === 'away' ? ' us' : '') + '">' + esc(m.away.name) + '</span>' +
        '<span class="rend">' +
          /* Which round, over the date. Only the round: the row is already six
             tracks wide, and league and season do not change from one of these
             five to the next — they are on the card above instead. */
          (m.round ? '<span class="rrd">' + esc(m.round) + '</span>' : '') +
          '<span class="rd">' + esc(window.HNA.shortDate(m.date)) + '</span>' +
          '<span class="m-open" aria-hidden="true">' +
            '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M1 0 9 5 1 10Z"/></svg>' +
          '</span>' +
        '</span>';
      b.addEventListener('click', function () { location.hash = '#/match/' + encodeURIComponent(m.slug || m.id); });
      rl.appendChild(b);
    });
    res.appendChild(rl);
    return res;
  }

  /* ---------- Key players ----------
     Goals, assists and key passes, added up across the club's own side of
     every submitted match. A player is tallied under his NAME where the
     squad gives one: shirt numbers move between windows — a national-team
     call-up renumbers everybody — and a number is only an identity when
     nothing better is on record. */
  var KEY_PLAYERS = [
    ['Top Scorer',   'goals',     'goals'],
    ['Top Assist',   'assists',   'assists'],
    ['Top Key Pass', 'keyPasses', 'key passes']
  ];

  function playerTally(aggs) {
    var tally = {};
    aggs.forEach(function (a) {
      Object.keys(a.players).forEach(function (no) {
        var nm = a.names[String(no).trim()] || '';
        var key = nm ? 'n:' + nm.toLowerCase() : '#' + no;
        var t = tally[key] || (tally[key] =
          { name: nm || playerLabel(a.names, no), no: no, apps: 0, goals: 0, assists: 0, keyPasses: 0 });
        t.no = no;                       // the most recent shirt he wore
        t.apps++;
        t.goals += a.players[no].goals;
        t.assists += a.players[no].assists;
        t.keyPasses += a.players[no].keyPasses;
      });
    });
    return Object.keys(tally).map(function (k) { return tally[k]; });
  }

  /* Cards, not links. There is a #/players route, but nothing fills it in:
     supa.js hands each match a lineup and no player rows, so renderPlayers
     has never had anything to list. A chevron into an empty page is worse
     than no chevron, so these say what they know and stop there. */
  function keyPlayersRow(aggs) {
    var people = playerTally(aggs);
    var grid = el('div', 'kp-grid');
    KEY_PLAYERS.forEach(function (spec) {
      var best = people.slice().sort(function (a, b) {
        return b[spec[1]] - a[spec[1]] || b.apps - a.apps;
      })[0];
      if (best && !best[spec[1]]) best = null;

      grid.appendChild(el('div', 'kp' + (best ? '' : ' none'),
        '<p class="kp-h">' + esc(spec[0]) + '</p>' +
        '<div class="kp-b">' +
          '<span class="kp-av">' + (best ? esc(best.no) : '–') + '</span>' +
          '<span class="kp-n">' + (best ? esc(best.name) : 'Nobody yet') +
            '<em>' + (best ? 'in ' + best.apps + (best.apps === 1 ? ' match' : ' matches')
                           : 'no ' + spec[2] + ' recorded') + '</em></span>' +
          '<b class="kp-v">' + (best ? best[spec[1]] : '—') + '</b>' +
        '</div>'));
    });
    return grid;
  }

  /* ---------- Team Data ----------
     One row per match. Date, opposing team, result, score and possession are
     on every category; what follows them is whichever of shared.js's
     TEAM_SECTIONS this tab names, so the columns are the same measures the
     match page compares the two sides on. */
  function sectionCols(title) {
    var secs = (typeof TEAM_SECTIONS === 'undefined') ? [] : TEAM_SECTIONS;
    var found = secs.filter(function (s) { return s[0] === title; })[0];
    /* Possession is a fixed column on all four tabs, so Distribution must
       not print it a second time. */
    return (found ? found[1] : []).filter(function (c) { return c[0] !== 'Possession %'; });
  }

  /* Which header a column sits under. Only runs of ADJACENT columns sharing
     a name are merged, so a set that changes order in shared.js degrades to
     plain single headers rather than to a wrong span. */
  var TD_GROUP = {
    'Total Shots': 'Shots', 'Shots On Target': 'Shots', 'Shots Off Target': 'Shots',
    'Blocked Shots': 'Shots', 'Miss Shots': 'Shots', 'Shooting Accuracy': 'Shots',
    'Passes': 'Passing', 'Passes Completed': 'Passing', 'Pass Accuracy': 'Passing',
    /* no Cross Accuracy: TEAM_SECTIONS does not carry one, and inventing it
       here would be the one measure on this page that the match page cannot
       also show */
    'Crosses': 'Crossing', 'Crosses Completed': 'Crossing',
    'Take-ons': 'Take-ons', 'Take-ons Won': 'Take-ons', 'Take-on Success': 'Take-ons',
    'Tackles': 'Tackles', 'Tackles Won': 'Tackles', 'Tackle Success': 'Tackles',
    'Aerial Duels': 'Duels', 'Aerial Duels Won': 'Duels',
    'Physical Duels': 'Duels', 'Physical Duels Won': 'Duels',
    'Loose Ball Duels': 'Duels', 'Loose Ball Duels Won': 'Duels',
    'Corners': 'Set Pieces', 'Free-kicks': 'Set Pieces', 'Penalty Kicks': 'Set Pieces',
    'Throw-ins': 'Set Pieces', 'Goal Kicks': 'Set Pieces',
    'Set Piece Shots': 'From set pieces', 'Set Piece Goals': 'From set pieces',
    'Saves': 'Shot stopping', 'Catches': 'Shot stopping', 'Parries': 'Shot stopping',
    'Total Fouls': 'Fouls', 'Fouls': 'Fouls', 'Handball Fouls': 'Fouls',
    'Foul Throws': 'Fouls',
    'Yellow Cards': 'Cards', 'Red Cards': 'Cards'
  };

  function renderTeamData(body, cat) {
    body.appendChild(catTabs(cat));

    var aggs = aggregates();
    if (!aggs.length) {
      body.appendChild(emptyState('No submitted analysis to tabulate',
        'These numbers come from what an analyst sends over with Submit Analysis. Once a match ' +
        'in this channel has been submitted, every column below fills in.'));
      return;
    }

    var tab = TD_TABS.filter(function (t) { return t[0] === cat; })[0];
    var cols = sectionCols(tab[2]);
    var rows = aggs.slice().reverse();          // most recent match first

    /* --- two header rows: the groups, then the leaves --- */
    /* Six fixed columns. Round is the one of the three new fields that changes
       from match to match, so it is the one worth a column; league and season
       would print the same word down the whole table, and they are on the
       Overview's card and in the player's Season table instead.

       It sits after the fixture rather than after the date, because .c-date and
       .c-opp are a frozen pair and a sticky run has to be contiguous — see the
       note on .c-rnd in app.css. */
    var top = '<th class="c-date" rowspan="2">Date</th>' +
              '<th class="c-opp" rowspan="2">Opposing team</th>' +
              '<th class="c-rnd" rowspan="2">Round</th>' +
              '<th class="c-res" rowspan="2">Result</th>' +
              '<th class="c-sc" rowspan="2">Score</th>' +
              '<th rowspan="2">Possession</th>';
    var second = '';
    for (var i = 0; i < cols.length;) {
      var g = TD_GROUP[cols[i][0]], j = i;
      while (g && j < cols.length && TD_GROUP[cols[j][0]] === g) j++;
      if (g && j - i > 1) {
        top += '<th class="gh" colspan="' + (j - i) + '">' + esc(g) + '</th>';
        for (var k = i; k < j; k++) second += '<th>' + esc(cols[k][0]) + '</th>';
        i = j;
      } else {
        top += '<th rowspan="2">' + esc(cols[i][0]) + '</th>';
        i++;
      }
    }

    var cells = function (a) {
      return cols.map(function (c) { return '<td>' + esc(String(c[1](a.us, a.them))) + '</td>'; }).join('');
    };
    var tbody = rows.map(function (a) {
      var m = a.m;
      return '<tr data-go="' + esc(m.slug || m.id) + '">' +
        '<td class="c-date">' + esc(window.HNA.shortDate(m.date)) + '</td>' +
        '<td class="c-opp"><span class="cop"><b>' + esc(m.opponent) + '</b>' +
          '<em>' + (m.side === 'home' ? 'H' : 'A') + '</em></span></td>' +
        '<td class="c-rnd">' + esc(m.round || '—') + '</td>' +
        '<td class="c-res">' + (m.result ? '<span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span>' : '—') + '</td>' +
        '<td class="c-sc">' + num(a.gf) + ' : ' + num(a.ga) + '</td>' +
        '<td>' + pct(a.us.passes, a.us.passes + a.them.passes) + '</td>' +
        cells(a) + '</tr>';
    }).join('');

    /* No campaign row: this table is the matches, one each. What the whole
       campaign came to is the Overview's job, and totalOf() still works it
       out for the strip there. */
    var wrap = el('div', 'stbl-wrap');
    wrap.innerHTML = '<table class="stbl"><thead><tr>' + top + '</tr><tr>' + second + '</tr></thead>' +
      '<tbody>' + tbody + '</tbody></table>';
    /* One listener rather than one per row — the table is redrawn on every
       tab click and rows outnumber everything else on the page. */
    wrap.addEventListener('click', function (e) {
      var tr = e.target.closest ? e.target.closest('tr[data-go]') : null;
      if (tr) location.hash = '#/match/' + encodeURIComponent(tr.getAttribute('data-go'));
    });
    body.appendChild(wrap);
  }

  /* ---------------------------------------------------------
     View: Player Data — one player, the whole campaign

     The same reports the two sections above add up, cut by the man rather than
     by the match. The columns are shared.js's own PLAYER_CATS: the very four
     sets the Stats tab draws a single match's player table from, so a figure
     here and the same figure there come out of one implementation.

     Which player and which category are in the hash —
     #/data/player/n%3Aelva/defensive is a link somebody can send.
     --------------------------------------------------------- */

  /* Cards used to be walked off the rows here, because newStat() did not carry
     them. It does now: computeStats() runs shared.js's classifyCards() itself, so
     a second yellow counts as one booking AND the sending-off it is, worked out in
     one place that the Stats tab, the match timeline and this page all read.

     What is left is a reshape — the {no: {y, r}} the rest of this file indexes by
     shirt, taken off a tally that has already been computed rather than counted a
     second time. Players with no card are left out, as they always were. */
  function playerCards(players) {
    var out = {};
    Object.keys(players || {}).forEach(function (no) {
      var s = players[no];
      if (s.yellowCards || s.redCards) out[no] = { y: s.yellowCards, r: s.redCards };
    });
    return out;
  }

  /* What a keeper's match came to, for each shirt that kept goal in it:
     {conceded, clean, known}, all three summable so a campaign is the sum.

     Conceded is what ended up in our net while HE was on the pitch — their
     goals and our own goals alike, which is the reading teamGoals() takes for
     a scoreline. Asking shared.js who was on at the moment of each goal is
     what makes a keeper swapped at half-time, a keeper sent off, and a goal
     tagged out of order all come out right without a case for any of them.

     `known: 1` says the line-ups could answer at all; a match with none has no
     keeper in it and no entry here, and the columns read "—" rather than 0. */
  function gkFigures(rows, lineups, team) {
    var keepers = window.gkShirts(lineups, team), out = {};
    if (!keepers.size) return out;
    keepers.forEach(function (no) { out[no] = { conceded: 0, clean: 0, known: 1 }; });
    var opp = team === 'home' ? 'away' : 'home';
    rows.forEach(function (r) {
      var e = String(r.event == null ? '' : r.event).trim().toLowerCase();
      var against = (r.team === opp && e === 'goal') ||
                    (r.team === team && (e === 'own goal' || e === 'own-goal'));
      if (!against) return;
      var on = window.onPitchAt(lineups, team, +r.t || 0);
      keepers.forEach(function (no) { if (on.has(no)) out[no].conceded++; });
    });
    keepers.forEach(function (no) { if (!out[no].conceded) out[no].clean = 1; });
    return out;
  }

  /* Shirt number -> where he stood, for one side of one match. The same board
     gkShirts() reads to find the keeper, read for every square instead of the
     one:

       { '4': { start: 'CB', all: ['CB', 'CDM'] } }

     `start` is the square he was PICKED in — the earliest snapshot naming him,
     which is the starting XI for a starter and the spot the man he replaced left
     behind for a substitute. That is the shape the team sheet gave him, and it
     is what settles his main role.
     `all` is every square he stood in that match: a man who begins at left back
     and pushes up to left midfield after a substitution was both, and both are
     true.

     The staging square beside the keeper answers '' (zoneAt does that) — it is
     somewhere to park a dot, not a position. Skipped here rather than turned
     into a role. */
  function posFigures(lineups, team) {
    var lu = (lineups && lineups[team]) || null, out = {};
    if (!lu) return out;
    var take = function (xi) {
      (xi || []).forEach(function (p) {
        var no = String(p && p.no == null ? '' : p.no).trim();
        var ps = String(p && p.pos == null ? '' : p.pos).trim();
        if (!no || !ps) return;
        var e = out[no] || (out[no] = { start: '', all: [] });
        if (!e.start) e.start = ps;                       // earliest snapshot wins
        if (e.all.indexOf(ps) < 0) e.all.push(ps);
      });
    };
    take(lu.xi);                                          // the starting XI first
    /* Sorted, which gkShirts() does not need to be: it only asks whether a shirt
       was ever in the GK square, and `start` asks which square came first. A
       double substitution tagged out of order still has to name the right one. */
    ((lineups && lineups.history) || []).filter(function (h) { return h && h.team === team; })
      .slice().sort(function (a, b) { return (+a.t || 0) - (+b.t || 0); })
      .forEach(function (h) { take(h.xi); });
    return out;
  }

  /* Add a run of stat objects up into one. Starts from shared.js's own zero
     row, so every percentage in PLAYER_CATS comes out as one ratio of the
     totals rather than as a mean of per-match ratios. totalOf() above does the
     same for the two team columns; it takes aggregates rather than stats,
     which is why this sits beside it rather than inside it. */
  function sumStats(list) {
    var t = window.newStat();
    list.forEach(function (s) { for (var k in t) t[k] += (s[k] || 0); });
    return t;
  }

  /* A name met alongside a players row anywhere in the campaign IS that row
     everywhere: a squad entry carries the pid and the name on one line, so one
     match picked from the team's list is enough to place the man in every other
     match where somebody typed his name by hand.

     A name that has been seen against TWO pids is left alone. Quietly merging
     two people is the worst kind of wrong there is here, because every figure
     still adds up — it is simply somebody else's. */
  function aliasMap(aggs) {
    var seen = {};
    aggs.forEach(function (a) {
      Object.keys(a.ids || {}).forEach(function (no) {
        var nm = (a.names[no] || '').toLowerCase(), pid = a.ids[no];
        if (!nm || !pid) return;
        (seen[nm] = seen[nm] || {})[pid] = 1;
      });
    });
    var out = {};
    Object.keys(seen).forEach(function (nm) {
      var pids = Object.keys(seen[nm]);
      if (pids.length === 1) out['n:' + nm] = 'p:' + pids[0];
    });
    return out;
  }

  /* Every player of the club's own side, across every submitted match — and a
     player is a PERSON, not a shirt. A call-up renumbers a squad, so the same
     man is 14 in one window and 9 in the next; nothing below shows a number for
     him, because a number is a fact about a match rather than about him.

     Three keys, best first:

       p:<uuid>  the players row the squad entry was picked from. Survives a
                 changed number and a changed spelling alike.
       n:<name>  no players row, but a name — and no two players share one.
       #<shirt>  a match with no squad list at all. Merged with nobody: a bare
                 number is the one thing that cannot be trusted to mean the same
                 man in the next match.

     Who counts as having appeared: everyone playedMinutes() found on the pitch
     — the starting XI, every later formation snapshot, everyone brought on —
     plus everyone with a tagged event. An unused substitute is in neither,
     which is the point: he did not appear. A match whose report carries no
     line-up has no minutes at all, so its players come from the events alone
     and read "—" for minutes, exactly as they do on the Stats tab.

     Nothing here writes to a stat object it did not make: `a.players` is the
     same object the Key Players cards read. */
  function playerIndex(aggs) {
    var alias = aliasMap(aggs), by = {}, order = [];
    aggs.forEach(function (a) {
      var seen = {};
      var add = function (raw) {
        var no = String(raw == null ? '' : raw).trim();
        if (!no || seen[no]) return;                  // one row per man per match
        seen[no] = 1;
        var nm = a.names[no] || '', pid = (a.ids || {})[no] || '';
        var key = pid ? 'p:' + pid : (nm ? 'n:' + nm.toLowerCase() : '#' + no);
        key = alias[key] || key;
        var p = by[key];
        if (!p) {
          p = by[key] = { key: key, name: nm || playerLabel(a.names, no), matches: [] };
          order.push(p);
        }
        if (nm) p.name = nm;
        p.matches.push({
          m: a.m, gf: a.gf, ga: a.ga,
          stat: a.players[no] || window.newStat(),
          mins: (a.mins && a.mins[no]) || null,
          cards: (a.cards && a.cards[no]) || { y: 0, r: 0 },
          gk: (a.gk && a.gk[no]) || null,
          pos: (a.pos && a.pos[no]) || null
        });
      };
      Object.keys(a.mins || {}).forEach(add);
      Object.keys(a.players).forEach(add);
    });

    order.forEach(function (p) {
      p.apps = p.matches.length;
      /* The minutes SHOWN, added up — so the total under the column is what
         the eye gets adding the column itself. Re-deriving it from the raw
         seconds would be a truer number and a worse one: it can land a minute
         off what is on the screen above it. */
      p.min = p.matches.reduce(function (n, r) { return n + (r.mins ? r.mins.min : 0); }, 0);
      p.timed = p.matches.some(function (r) { return r.mins; });
      p.exact = p.matches.every(function (r) { return r.mins && r.mins.exact; });
      p.total = sumStats(p.matches.map(function (r) { return r.stat; }));
      p.cards = p.matches.reduce(function (c, r) {
        return { y: c.y + r.cards.y, r: c.r + r.cards.r };
      }, { y: 0, r: 0 });
      /* A keeper keeps goal. One match in the GK square settles it for the
         campaign: the position a man is picked in does not move about the way
         his number does, and a board an analyst never tidied is not evidence
         that he played somewhere else that week. */
      p.gk = p.matches.some(function (r) { return r.gk; });
      p.gkTotal = p.matches.reduce(function (g, r) {
        return r.gk ? { conceded: g.conceded + r.gk.conceded, clean: g.clean + r.gk.clean,
                        known: g.known + r.gk.known } : g;
      }, { conceded: 0, clean: 0, known: 0 });
      /* Every square he has stood in, and how many matches in each — that is what
         the board over his tiles lights up, and what its tooltips count.
         `roles` is the same run read one level up, in the fixed order Defender,
         Midfielder, Striker rather than the order they turned up in: it is what
         says whether a role asked for in the URL is one he ever actually played. */
      var posApps = {}, first = '';
      p.matches.forEach(function (r) {
        if (!r.pos) return;
        /* matches are in kickoff order, so the earliest one that placed him at
           all is the first position he played */
        if (!first && r.pos.start) first = r.pos.start;
        var seen = {};
        (r.pos.all || []).forEach(function (ps) {
          if (seen[ps]) return;
          seen[ps] = 1;
          posApps[ps] = (posApps[ps] || 0) + 1;
        });
      });
      p.posApps = posApps;
      p.pos0 = first;
      p.roles = ROLES.filter(function (r) {
        return ROLE_POS[r[0]].some(function (ps) { return posApps[ps]; });
      }).map(function (r) { return r[0]; });
      /* The card a profile opens on is the job of the FIRST square he played in.
         Not the one he played most: a man is introduced by where he began, and a
         reading that shifts as the season adds matches is a reading nobody can
         point at twice. */
      p.role = ROLE_OF[first] || '';
    });

    return order.sort(function (x, y) {
      return y.min - x.min || y.apps - x.apps || x.name.localeCompare(y.name);
    });
  }

  /* Built once per channel and kept, like the reports it is built from: the
     category chips and the player dropdown redraw from what is already here.
     loadMatches() drops it when the channel changes. */
  var playerJob = null;
  function playerList() {
    var ch = state.channel;
    if (playerJob && playerJob.forChannel === ch.id) return playerJob.list;
    var list = playerIndex(aggregates());
    playerJob = { forChannel: ch.id, list: list };
    return list;
  }

  /* shared.js may not have loaded — sectionCols() takes the same precaution.
     A column set that is not there draws an empty table, not an exception. */
  function catCols(cat) {
    if (cat === 'goalkeeping') return (typeof GK_COLS === 'undefined') ? [] : GK_COLS;
    var C = (typeof PLAYER_CATS === 'undefined') ? null : PLAYER_CATS;
    return (C && C[cat]) || [];
  }

  /* A keeper reads the same subjects as everyone else, with one swapped and one
     dropped. Swapped: his shots are a column of zeroes for ever, and what belongs
     in their place is what happened at the other end — GK_COLS, which takes the
     match around him as well as the man and so can show Save Rate and Clean Sheets.

     Dropped: PLAYER_CATS.goalkeeper, because GK_COLS already contains every column
     it has and four more. Leaving both in gave a keeper two tabs a letter apart —
     "Goalkeeping" and "Goalkeeper" — showing nearly the same table.

     Derived from TD_TABS rather than written out again, so the subjects he shares
     stay the subjects everybody else has. */
  var GK_TABS = TD_TABS
    .map(function (t) {
      return t[0] === 'shooting' ? ['goalkeeping', 'Goalkeeping'] : t;
    })
    .filter(function (t) { return t[0] !== 'goalkeeper'; });
  /* And the mirror of that for everyone else: an outfield player is offered no
     Goalkeeper tab, because all fifteen of its columns are zero on him for ever.
     The Stats tab draws the same conclusion from the formation board — see
     catPlayers() in Stats/stats-view.js.

     TD_TABS itself keeps the category: Team Data reads it for the name of the
     TEAM_SECTIONS section, and a team does have a goalkeeper. Only the per-player
     tab strip is cut. */
  var OUT_TABS = TD_TABS.filter(function (t) { return t[0] !== 'goalkeeper'; });
  var tabsFor = function (who) { return who.gk ? GK_TABS : OUT_TABS; };

  /* A campaign total in the same three readings the Stats tab gives one match:
     "—" where no line-up ever named him, a leading "~" where any of the
     matches had no Duration boundaries and the video's own clock stood in. */
  function minsTotal(p) {
    if (!p.timed) return '—';
    return (p.exact ? '' : '~') + p.min + "'";
  }
  /* ---------- roles ----------
     key, the long name a square's tooltip uses, what the badge beside his name
     says. This order is the last tie-break for his main role — read from the back
     line forward, the way POS_ORDER walks the board. */
  var ROLES = [['defender', 'Defender', 'DEF'],
               ['midfielder', 'Midfielder', 'MID'],
               ['striker', 'Striker', 'ST']];
  /* position -> role. The fifteen outfield squares of FORMATION_GRID, none missing. */
  var ROLE_POS = {
    defender:   ['RB', 'CB', 'LB', 'RWB', 'LWB'],
    midfielder: ['CDM', 'CM', 'RM', 'LM', 'CAM'],
    striker:    ['LW', 'RW', 'CF', 'RF', 'LF']
  };
  var ROLE_OF = {}, ROLE_LABEL = {}, ROLE_BADGE = {};
  ROLES.forEach(function (r) {
    ROLE_LABEL[r[0]] = r[1]; ROLE_BADGE[r[0]] = r[2];
    ROLE_POS[r[0]].forEach(function (p) { ROLE_OF[p] = r[0]; });
  });
  /* One match's minutes cell, which is minsCell() in Stats/stats-view.js, cell
     for cell — same mark, same tooltip, same empty */
  function minsOne(mn) {
    if (!mn) return '<td>—</td>';
    var title = mn.exact ? '1st ' + Math.round(mn.h1 / 60) + "' · 2nd " + Math.round(mn.h2 / 60) + "'"
                         : 'approximate — the match duration has not been set';
    return '<td title="' + esc(title) + '">' + (mn.exact ? '' : '~') + mn.min + "'</td>";
  }

  function renderPlayerData(body, rest) {
    var people = playerList();
    if (!people.length) {
      body.appendChild(emptyState('No submitted analysis to read',
        'These players come from what an analyst sends over with Submit Analysis. Once a match ' +
        'in this channel has been submitted, everyone who played in it is listed here.'));
      return;
    }
    var key = rest[1] ? decodeURIComponent(rest[1]) : '';
    var who = key ? people.filter(function (p) { return p.key === key; })[0] : null;
    /* A link made in another channel, or before a squad gave this shirt a
       name. Back to the list rather than to a blank page — and replaced, so
       Back does not walk straight into the same dead key again. */
    if (key && !who) { location.replace('#/data/player'); return; }
    if (!who) return renderPlayerList(body, people);
    /* rest[3] used to be the role the position board filtered on. The board is a
       picture now, so nothing writes that segment any more — and a link somebody
       saved while it did still lands on the right player and the right category,
       with the extra segment simply not read. */
    renderPlayerProfile(body, who, people, rest[2]);
  }

  /* ---------- the list ----------
     Two sets of columns, because two jobs. Goals and Key Passes say nothing
     about a goalkeeper, and what does say something — what he kept out and what
     went past him — says nothing about anybody else. */
  var PL_OUT = [
    ['Apps',       function (p) { return p.apps; }],
    ['Minutes',    function (p) { return minsTotal(p); }],
    ['Goals',      function (p) { return p.total.goals; }],
    ['Assists',    function (p) { return p.total.assists; }],
    ['Key Passes', function (p) { return p.total.keyPasses; }]
  ];
  var PL_GK = [
    ['Apps',         function (p) { return p.apps; }],
    ['Minutes',      function (p) { return minsTotal(p); }],
    ['Saves',        function (p) { return p.total.saves; }],
    ['Conceded',     function (p) { return gkCell(p, 'conceded'); }],
    ['Save Rate',    function (p) { return gkCell(p, 'rate'); }],
    ['Clean Sheets', function (p) { return gkCell(p, 'clean'); }]
  ];
  /* Nothing the line-ups could not answer is ever shown as 0: a keeper whose
     matches carry no formation board has no goals-conceded record, and 0 would
     claim he had a spotless one. */
  function gkCell(p, which) {
    var g = p.gkTotal;
    if (!g.known) return '—';
    if (which === 'conceded') return g.conceded;
    if (which === 'clean') return g.clean;
    return pct(p.total.saves, p.total.saves + g.conceded);
  }

  function renderPlayerList(body, people) {
    var out = people.filter(function (p) { return !p.gk; });
    var keepers = people.filter(function (p) { return p.gk; });
    if (out.length) body.appendChild(playerTable('Outfield players', out, PL_OUT));
    /* A channel whose boards nobody has placed a keeper on gets no second
       section: an empty table under a heading reads as data that is missing,
       when the truth is that nothing was ever claimed. */
    if (keepers.length) body.appendChild(playerTable('Goalkeepers', keepers, PL_GK));
    body.appendChild(el('p', 'note',
      'Everyone who took the pitch in a submitted match, most minutes first. A substitute who ' +
      'was named but never came on is not an appearance and is not listed. Shirt numbers are ' +
      'not shown: they belong to a match rather than to a player, and a squad is renumbered ' +
      'between windows.'));
  }

  function playerTable(title, people, cols) {
    var sec = el('div', 'pl-sec');
    sec.appendChild(el('p', 'card-h', esc(title) +
      '<span class="right">' + people.length + '</span>'));

    var head = '<th class="c-pl">Player</th>' +
      cols.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('');
    var rows = people.map(function (p) {
      return '<tr data-who="' + esc(encodeURIComponent(p.key)) + '">' +
        '<td class="c-pl"><b>' + esc(p.name) + '</b></td>' +
        cols.map(function (c) { return '<td>' + esc(String(c[1](p))) + '</td>'; }).join('') +
        '</tr>';
    }).join('');

    var wrap = el('div', 'stbl-wrap');
    wrap.innerHTML = '<table class="stbl"><thead><tr>' + head + '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
    /* One listener rather than one per row, as the match table does it */
    wrap.addEventListener('click', function (e) {
      var tr = e.target.closest ? e.target.closest('tr[data-who]') : null;
      if (tr) location.hash = '#/data/player/' + tr.getAttribute('data-who');
    });
    sec.appendChild(wrap);
    return sec;
  }

  /* ---------- one player ---------- */
  function renderPlayerProfile(body, who, people, wanted) {
    var tabs = tabsFor(who);
    var cat = tabs.some(function (t) { return t[0] === wanted; }) ? wanted : tabs[0][0];
    /* His role, and there is only ever one of it now: the job of the FIRST square
       he played in. The board used to be a filter, and a role asked for in the URL
       could override this; it is a picture now, so there is nothing to ask for and
       the badge beside his name always says the same thing. A keeper has no role —
       he keeps goal, and none of the three is that. */
    var role = who.gk ? '' : who.role;

    var back = el('button', 'back', '&larr; All players');
    back.addEventListener('click', function () { location.hash = '#/data/player'; });
    body.appendChild(back);

    body.appendChild(playerHead(who, people, cat, role));

    /* Where he stood on the left, what he has played on the right — one row, and
       two on a phone. Appearances and Minutes are the Season table's own last two
       columns, so no tile repeats them underneath.

       A keeper, and a man no line-up ever placed, get no board (positionBoard
       returns null for both). The Season card then takes the width on its own
       rather than sitting in a two-column row with an empty half beside it. */
    var board = positionBoard(who);
    if (board) {
      var duo = el('div', 'pl-duo');
      duo.appendChild(board);
      duo.appendChild(seasonCard(who));
      body.appendChild(duo);
    } else {
      body.appendChild(seasonCard(who));
    }

    body.appendChild(catTabs(cat, '#/data/player/' + encodeURIComponent(who.key) + '/', tabs));
    body.appendChild(playerMatchTable(who, cat));
  }

  /* ---------- what he has played, by league and by season ----------
     His matches grouped into the pairs the Season table has one row for. Both
     fields are database columns nobody has filled in yet, so today every match
     falls into one group and the table has one row — but the grouping is here
     from the start, because hard-coding the single row and splitting it later is
     writing the same feature twice.

     The separator is U+0000 because no competition name contains one. Joining on
     "-" or "/" would put ("A/B", "C") and ("A", "B/C") in the same group. */
  function seasonRows(who) {
    var by = {}, out = [];
    who.matches.forEach(function (r) {
      var lg = String(r.m.league || ''), sn = String(r.m.season || '');
      var k = lg + '\u0000' + sn;
      var g = by[k];
      if (!g) { g = by[k] = { league: lg, season: sn, rows: [], last: '' }; out.push(g); }
      g.rows.push(r);
      if (String(r.m.date || '') > g.last) g.last = String(r.m.date || '');
    });
    out.forEach(function (g) {
      g.apps = g.rows.length;
      /* The three reductions playerIndex() makes over a whole campaign, made over
         one group instead — so minsTotal() prints the same thing here as it does
         on the tile beside it, on the Minutes Played column, and in the player
         dropdown. One rule, one function, four readers. */
      g.min   = g.rows.reduce(function (n, r) { return n + (r.mins ? r.mins.min : 0); }, 0);
      g.timed = g.rows.some(function (r) { return r.mins; });
      g.exact = g.rows.every(function (r) { return r.mins && r.mins.exact; });
    });
    /* Most recent first, as the match table does it. The key is the DATE of the
       latest match in the group, not the season string: "23/24" and "2023-24" are
       both things somebody may type, and sorting text on them gives a wrong order.
       League then season break a tie, so the order does not depend on which match
       happened to be read first. */
    return out.sort(function (a, b) {
      return (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) ||
             a.league.localeCompare(b.league) || a.season.localeCompare(b.season);
    });
  }

  /* The card on the right. Four columns for everybody — a centre back, a striker
     and a keeper read the same four, which is the whole point of it replacing a
     row of tiles that changed with the job he did.

     Nothing here is clickable and nothing listens: it is the one thing on this
     page that only reports. */
  function seasonCard(who) {
    var card = el('div', 'card pl-season');
    card.appendChild(el('p', 'card-h', 'Season'));

    var rows = seasonRows(who).map(function (g) {
      return '<tr>' +
        '<td class="c-lg">' + esc(g.league || '—') + '</td>' +
        '<td class="c-sn">' + esc(g.season || '—') + '</td>' +
        '<td>' + g.apps + '</td>' +
        '<td>' + esc(minsTotal(g)) + '</td>' +
        '</tr>';
    }).join('');

    var wrap = el('div', 'stbl-wrap');
    wrap.innerHTML = '<table class="stbl"><thead><tr>' +
      '<th class="c-lg">League</th><th class="c-sn">Season</th>' +
      '<th>Appearances</th><th>Minutes</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
    card.appendChild(wrap);
    return card;
  }

  /* Where he has stood, on the board he was placed on.

     The same six-by-three grid the tagger writes `pos` from (FORMATION_GRID), on
     the same pitch drawing (pitchSVG), with a dot on every square he has actually
     played and nothing at all on the rest.

     A PICTURE, not a control. It used to be a filter — clicking a square chose the
     row of tiles for the job that square belonged to — and those tiles are gone, so
     the squares no longer stand for anything a click could change. They are `div`s
     rather than `button`s and the card hangs no listener: something that looks
     pressable and does nothing is worse than something that plainly reports.

     Every square of his role is lit, not just one, and the badge beside his name
     says the same role. That is also what teaches the mapping — LW and RW light
     together because both are the striker's.

     The board always reads left to right. `pos` is stored canonically, zoneAt()
     having already turned the attacking direction out of it, so there is no one
     direction a campaign was played in to honour — and a fixed one is the only
     reading that does not move between two players, or between two visits.

     Nothing here for a keeper: he has no role among the three, and the GK square is
     the one square this grid never lights. Nothing either for a man no board ever
     placed — an empty pitch would be a question, and the answer is in the empty
     state he already gets. */
  function positionBoard(who) {
    /* Any square at all, GK included. A keeper used to be left out because the
       board picked which row of tiles was shown and none of the three roles was
       his; it reports now, and where he stood is worth reporting for him as much
       as for anybody. `roles` cannot answer this — GK belongs to no role — so the
       question is asked of posApps, which is every square he has actually taken.
       A man no line-up ever placed still has none, and still gets nothing: an
       empty pitch is a question, and the answer is in his empty state. */
    if (!Object.keys(who.posApps).length) return null;
    var role = who.gk ? '' : who.role;
    var card = el('div', 'card pl-pos');
    card.appendChild(el('p', 'card-h', 'Position'));

    /* The channel's own game, so a futsal club gets a futsal court — the tagger
       lays this same six-by-three grid over whichever pitch it drew, and this is
       that pitch read back. The shape comes from PITCH_DIMS rather than from the
       stylesheet for the same reason: a court is not a pitch's proportions.

       The id belongs to the tagger's board, where the dots being placed live in
       it. Nothing reads it here, and two of them in one document is a bug waiting
       for whoever writes the third. */
    var sport = (state.channel && state.channel.sport) || 'football';
    var dim = PITCH_DIMS[sport] || PITCH_DIMS.football;
    var pitch = el('div', 'pl-pitch', pitchSVG(sport).replace(' id="pv-dots"', ''));
    pitch.style.aspectRatio = dim.w + ' / ' + dim.h;
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 6; col++) {
        var ps = FORMATION_GRID[effRow(row, 'lr')][effCol(col, 'lr')];
        if (!ps || !who.posApps[ps]) continue;     // the two blank cells, and every square he never took
        /* GK belongs to no role — ROLE_OF has nothing for it — so it is lit off
           what he IS rather than off a role being read. A keeper who once filled
           in at centre back sees both squares, with his own the one lit. */
        var r = ROLE_OF[ps] || '';
        var b = el('div', 'pl-pz' + ((r ? r === role : who.gk) ? ' on' : ''),
          '<span class="pl-pz-dot"></span><span class="pl-pz-lb">' + esc(ps) + '</span>');
        b.style.left = (col * 100 / 6) + '%';
        b.style.top = PZ_ROW_TOP[row] + '%';
        b.style.width = (100 / 6) + '%';
        b.style.height = PZ_ROW_H[row] + '%';
        /* which job the square belongs to, then how often he took it. The mapping
           still comes first: it is what explains why the other squares of the same
           role are lit alongside this one. GK is its own job and names itself. */
        b.title = (r ? ROLE_LABEL[r] : 'Goalkeeper') + ' · ' + who.posApps[ps] +
                  (who.posApps[ps] === 1 ? ' match' : ' matches') + ' at ' + ps;
        pitch.appendChild(b);
      }
    }
    /* Which way the board reads, since it is not the way any one match was played */
    var arrow = el('span', 'pl-pz-arrow', '&#9654;');
    arrow.setAttribute('aria-hidden', 'true');
    pitch.appendChild(arrow);

    card.appendChild(pitch);
    return card;
  }

  /* Name, role, and the way to another player without going back for him.
     The dropdown is the channel Settings menu's, down to taking its document
     listener off with it: this view is redrawn on every category click, and a
     listener left behind would keep a detached node alive for the life of the
     page. */
  function playerHead(who, people, cat, role) {
    var card = el('div', 'card pl-head');
    /* No shirt number anywhere on this card. He wore whichever one the squad
       was numbered with that week, and a single one printed beside his name
       reads as a property of the man. The role is not like that — a keeper
       keeps goal, a centre back defends — so that is what is worth a badge, and
       it says which role is being READ, so a man with two of them can tell. */
    var id = el('div', 'pl-id',
      '<span class="pl-nm">' + esc(who.name) + '</span>' +
      (who.gk ? '<span class="pl-role">GK</span>'
              : role ? '<span class="pl-role">' + esc(ROLE_BADGE[role]) + '</span>' : ''));

    var wrap = el('span', 'menu-wrap');
    var btn = el('button', 'btn btn-ghost menu-btn',
      'Player <span class="caret" aria-hidden="true">▼</span>');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    var menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    people.forEach(function (p) {
      var o = el('button', 'menu-opt' + (p.key === who.key ? ' on' : ''),
        esc(p.name) + (p.gk ? ' <span class="pl-role sm">GK</span>' : '') +
        '<em>' + p.apps + (p.apps === 1 ? ' match' : ' matches') +
        ' · ' + esc(minsTotal(p)) + '</em>');
      o.type = 'button';
      /* The category he was being read in is kept — comparing two players on
         Defensive should not drop back to Shooting halfway. Crossing between a
         keeper and an outfielder is the one case it cannot be: their first tab
         is a different tab, so that lands on his own, whichever it is. */
      o.addEventListener('click', function () {
        var keep = tabsFor(p).some(function (t) { return t[0] === cat; }) ? cat : tabsFor(p)[0][0];
        location.hash = '#/data/player/' + encodeURIComponent(p.key) + '/' + keep;
      });
      menu.appendChild(o);
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var away = function () {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (!wrap.isConnected) document.removeEventListener('click', away);
    };
    document.addEventListener('click', away);

    id.appendChild(wrap);
    card.appendChild(id);

    var first = who.matches[0], last = who.matches[who.matches.length - 1];
    card.appendChild(el('p', 'pl-meta',
      esc(who.apps + (who.apps === 1 ? ' appearance' : ' appearances')) + ' · ' +
      esc(minsTotal(who)) + ' · ' +
      esc(window.HNA.shortDate(first.m.date)) +
      (last !== first ? ' → ' + esc(window.HNA.shortDate(last.m.date)) : '') +
      /* The booking record, for everybody. It used to come down here only for a
         keeper and for a man with a role, because the row of tiles a man WITHOUT
         one got carried a Cards tile of its own and a figure never appears twice
         on one screen. That row is gone; this line is now the only place on the
         page a booking is printed, so it prints for all three. */
      ' · ' + who.cards.y + 'Y · ' + who.cards.r + 'R'));
    return card;
  }

  /* One row per match he played in, most recent first, then what the whole
     campaign came to in the foot. The five fixed columns are Team Data's, with
     Possession — a team measure — given over to Minutes Played. */
  function playerMatchTable(who, cat) {
    var cols = catCols(cat);
    /* The goalkeeping columns take a second argument — what went in past him
       that match, which his own stat row cannot carry. Everything else takes
       the stat row alone, exactly as the Stats tab feeds it. */
    var gkView = cat === 'goalkeeping';
    var NOGK = { conceded: 0, clean: 0, known: 0 };
    var cell = function (c, s, g) { return c[1](s, gkView ? (g || NOGK) : undefined); };

    var head = '<th class="c-date">Date</th><th class="c-opp">vs</th><th class="c-rnd">Round</th>' +
      '<th class="c-res">Result</th><th class="c-sc">Score</th><th>Minutes Played</th>' +
      cols.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('');

    var rows = who.matches.slice().reverse().map(function (r) {
      var m = r.m;
      return '<tr data-go="' + esc(m.slug || m.id) + '">' +
        '<td class="c-date">' + esc(window.HNA.shortDate(m.date)) + '</td>' +
        '<td class="c-opp"><span class="cop"><b>' + esc(m.opponent) + '</b>' +
          '<em>' + (m.side === 'home' ? 'H' : 'A') + '</em></span></td>' +
        '<td class="c-rnd">' + esc(m.round || '—') + '</td>' +
        '<td class="c-res">' + (m.result ? '<span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span>' : '—') + '</td>' +
        '<td class="c-sc">' + num(r.gf) + ' : ' + num(r.ga) + '</td>' +
        minsOne(r.mins) +
        cols.map(function (c) { return '<td>' + esc(String(cell(c, r.stat, r.gk))) + '</td>'; }).join('') +
        '</tr>';
    }).join('');

    /* The totals are the column functions run on the summed stat, not the
       summed cells: a percentage of the campaign is one ratio of its totals. */
    var foot = '<tr><td class="c-date">Total</td>' +
      /* empty, not "—": a campaign has no round, so there is nothing unknown
         here to mark. Missing the cell altogether would shift every figure in
         the foot one column left of the column it totals. */
      '<td class="c-opp"><span class="cop"><b>' + who.apps +
        (who.apps === 1 ? ' match' : ' matches') + '</b></span></td>' +
      '<td class="c-rnd"></td>' +
      '<td class="c-res"></td><td class="c-sc"></td>' +
      '<td>' + esc(minsTotal(who)) + '</td>' +
      cols.map(function (c) { return '<td>' + esc(String(cell(c, who.total, who.gkTotal))) + '</td>'; }).join('') +
      '</tr>';

    var wrap = el('div', 'stbl-wrap');
    wrap.innerHTML = '<table class="stbl"><thead><tr>' + head + '</tr></thead>' +
      '<tbody>' + rows + '</tbody><tfoot>' + foot + '</tfoot></table>';
    wrap.addEventListener('click', function (e) {
      var tr = e.target.closest ? e.target.closest('tr[data-go]') : null;
      if (tr) location.hash = '#/match/' + encodeURIComponent(tr.getAttribute('data-go'));
    });
    return wrap;
  }

  /* ---------------------------------------------------------
     View: players
     --------------------------------------------------------- */
  function renderPlayers(view) {
    if (!state.channel) return view.appendChild(noChannel());
    view.appendChild(head('Players', 'Who put the numbers on the board'));

    /* built from whatever the match player tables carry */
    var contributors;
    {
      var tally = {};
      state.matches.forEach(function (m) {
        (m.players || []).forEach(function (p) {
          var k = p.no + '·' + p.name;
          tally[k] = tally[k] || { name: p.name, no: p.no, goals: 0, assists: 0, detail: '' };
          tally[k].goals += p.goals || 0;
          tally[k].assists += p.assists || 0;
        });
      });
      contributors = Object.keys(tally).map(function (k) { return tally[k]; })
        .filter(function (p) { return p.goals || p.assists; })
        .sort(function (a, b) { return (b.goals * 2 + b.assists) - (a.goals * 2 + a.assists); });
    }

    if (!contributors.length) {
      view.appendChild(emptyState('No goal involvements recorded',
        'Once matches in this channel carry tagged goals and assists, the people behind them are listed here.'));
      return;
    }

    var wrap = el('div', 'people');
    contributors.forEach(function (p) {
      wrap.appendChild(el('div', 'person',
        '<div class="top"><span class="shirt">' + p.no + '</span><span class="nm">' + esc(p.name) + '</span></div>' +
        '<div class="gz"><span><b>' + p.goals + '</b> ' + (p.goals === 1 ? 'goal' : 'goals') + '</span>' +
        '<span><b>' + p.assists + '</b> ' + (p.assists === 1 ? 'assist' : 'assists') + '</span></div>' +
        (p.detail ? '<div class="dt">' + esc(p.detail) + '</div>' : '')));
    });
    view.appendChild(wrap);

    var totalG = contributors.reduce(function (a, p) { return a + p.goals; }, 0);
    view.appendChild(el('p', 'note',
      'Squad numbers are the ones each player was tagged under in the match concerned — a national-team ' +
      'call-up changes them between windows. ' + totalG + ' goals accounted for.'));
  }

  /* ---------------------------------------------------------
     The full Stats view, mounted inside this page.

     Stats/stats-view.js is the same file the tagging app's Stats page runs;
     there is no second implementation. What differs is only how it is fed:
     that page reads the tagging tab's localStorage and follows a #match=
     link, while here it is handed one published report and fetches nothing.

     Its files live with the tagging app, and the deploy moves that whole app
     under /tagger while this site becomes the root — so where they are
     depends on which of the two layouts is being served. Read it off the URL
     rather than guessing, the same way auth.js finds the site root.
     --------------------------------------------------------- */
  function taggerRoot() {
    return /\/client\//.test(location.pathname) ? '../' : 'tagger/';
  }

  var loaded = {};
  function loadOnce(url, kind) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function (ok, fail) {
      var n;
      if (kind === 'css') {
        n = document.createElement('link');
        n.rel = 'stylesheet'; n.href = url;
      } else {
        n = document.createElement('script');
        n.src = url; n.async = false;      // order matters: shared.js before the view
      }
      n.onload = function () { ok(true); };
      n.onerror = function () { fail(new Error('Could not load ' + url)); };
      document.head.appendChild(n);
    });
    return loaded[url];
  }

  /* The stat engine on its own: computeStats, sumTeam, playedMinutes,
     TEAM_SECTIONS, PLAYER_CATS, pct. The Data view needs those and nothing
     else — no spreadsheet library, no renderers, and none of the tagging
     app's stylesheets, which would land their own :root on this page for the
     sake of a table it does not draw. Same URL as the line below, so whichever
     view is opened first is the one that pays for it. */
  function loadShared() {
    return loadOnce(taggerRoot() + 'shared.js?v=27');
  }

  /* Pulled in the first time someone opens a match's stats, not on every page
     load — the spreadsheet library alone is larger than this whole site. */
  function loadStatsView() {
    var r = taggerRoot();
    loadOnce(r + 'shared.css?v=14', 'css');
    loadOnce(r + 'Stats/stats-view.css?v=10', 'css');
    return loadOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
      .then(function () { return loadShared(); })
      .then(function () { return loadOnce(r + 'Stats/stats-view.js?v=26'); })
      .then(function () { return loadOnce(r + 'Stats/report.js?v=37'); })
      /* The analyst's toolkit. This site's file, not the tagging app's — Q1 was
         answered B, so the right-click menu, the drawing layer, clips and the
         exports exist in the channel and nowhere else. It registers itself with
         the mounted view through the one hook stats-view.js publishes; a host
         that never loads it is a host where none of it exists. */
      .then(function () { return loadOnce('assets/film-tools.js?v=6'); })
      .then(function () {
        loadOnce('assets/film-tools.css?v=4', 'css');
        if (window.PTStats && window.PTStats.registerFilmTools && window.PTFilmTools)
          window.PTStats.registerFilmTools(window.PTFilmTools);
      });
  }

  /* ---------------------------------------------------------
     Data view pieces
     --------------------------------------------------------- */
  function tstat(label, value) {
    return '<div class="tstat"><span class="ts-l">' + esc(label) + '</span>' +
           '<span class="ts-v">' + num(value) + '</span></div>';
  }

  /* The Recent formation card that used to sit here is gone, and the pitch
     SVG with it. The starting XI is still in every match's `lineup` and is
     still drawn — on the match page, by the Stats view, for the match it
     actually belongs to, which is the only place it means anything. */

  /* ---------------------------------------------------------
     View: channel — the list, one channel's members, and the
     form that makes a new one.

     Everything below needs 0014_channel_admin.sql in the database.
     Where it is missing, the call rejects with a sentence saying so
     and that sentence is what the person reads.
     --------------------------------------------------------- */
  function renderChannel(view, rest) {
    if (!state.user) {
      view.appendChild(head('Channel', 'Sign in to create or manage a channel'));
      var s = emptyState('Not signed in',
        'Channels belong to an account. Sign in and any channel you create — or are invited to — is listed here.');
      var a = el('a', 'btn btn-primary', 'Sign in');
      a.href = 'login.html';
      s.appendChild(a);
      view.appendChild(s);
      return;
    }
    if (rest[0] === 'new') return renderChannelNew(view);
    if (rest[0] && rest[1] === 'edit') return renderChannelEdit(view, decodeURIComponent(rest[0]));
    if (rest[0]) return renderChannelOne(view, decodeURIComponent(rest[0]));
    return renderChannelList(view);
  }

  function ownChannels() {
    return state.channels;
  }

  function renderChannelList(view) {
    var mine = ownChannels();
    var h = head('Channels & members', mine.length
      ? mine.length + (mine.length === 1 ? ' channel' : ' channels') + ' on this account'
      : 'One channel is one club');
    var right = el('span', 'right');
    var add = el('button', 'btn btn-primary', '+ New channel');
    add.type = 'button';
    add.addEventListener('click', function () { location.hash = '#/channel/new'; });
    right.appendChild(add);
    h.appendChild(right);
    view.appendChild(h);

    if (!mine.length) {
      view.appendChild(emptyState('No channel yet',
        'A channel is one club. Create one and you are its admin: you invite the people who ' +
        'should see it, and the matches an analyst publishes to it show up under Home.'));
      return;
    }

    var list = el('div', 'clist');
    mine.forEach(function (c) {
      var b = el('button', 'crow');
      b.type = 'button';
      b.innerHTML =
        '<span class="cn">' + esc(c.name) + '<em>' + esc(roleLabel(c.role)) +
          (c.country ? ' · ' + esc(c.country) : '') +
          (c.isPublic ? ' · public' : '') + '</em></span>' +
        '<span class="cgo">›</span>';
      b.addEventListener('click', function () { location.hash = '#/channel/' + encodeURIComponent(c.slug); });
      list.appendChild(b);
    });
    view.appendChild(list);
    view.appendChild(el('p', 'note',
      'The channel you are looking at in the top bar is the one Home and Data read from. ' +
      'Switch channels there.'));
  }

  function roleLabel(role) {
    if (role === 'admin') return 'Admin';
    if (role === 'analyst') return 'Analyst';
    if (role === 'viewer') return 'Viewer';
    return 'Member';
  }

  /* ---------- Settings: edit, and delete ----------
     Behind a menu rather than as two buttons on the heading: one of them
     cannot be undone, and a control that deletes a club should not sit where
     a thumb lands on the way to something else. */
  function settingsMenu(ch) {
    var wrap = el('span', 'menu-wrap');
    var btn = el('button', 'btn btn-ghost menu-btn',
      'Settings <span class="caret" aria-hidden="true">▼</span>');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    var menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');

    var edit = el('button', 'menu-opt', 'Edit<em>Name, country, sport, team code</em>');
    edit.type = 'button';
    edit.addEventListener('click', function () {
      location.hash = '#/channel/' + encodeURIComponent(ch.slug) + '/edit';
    });

    var del = el('button', 'menu-opt danger', 'Delete<em>Remove this channel for everyone in it</em>');
    del.type = 'button';
    del.addEventListener('click', function () { deleteChannel(ch); });

    menu.appendChild(edit);
    menu.appendChild(del);
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    /* One document listener per menu, removed with the menu: the Channel view
       is redrawn on every role change, and a listener left behind would keep
       a detached node alive for the life of the page. */
    var away = function () {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (!wrap.isConnected) document.removeEventListener('click', away);
    };
    document.addEventListener('click', away);
    return wrap;
  }

  /* Deleting is the one thing on this site that cannot be undone from it, so
     the confirm spells out what goes and what does not, and asks for the name
     to be typed rather than for a click that a reflex can supply. */
  function deleteChannel(ch) {
    var typed = prompt(
      'Delete the channel ' + ch.name + '?\n\n' +
      'This cannot be undone from here.\n\n' +
      '  · everyone in it loses access immediately, including you\n' +
      '  · its published matches and analyses stop belonging to any channel,\n' +
      '    so nothing on this site can open them again\n' +
      '  · the matches themselves stay in the database, on the labeling site,\n' +
      '    and can be published to another channel\n\n' +
      'Type the channel name to confirm:');
    if (typed == null) return;                       // Cancel
    if (typed.trim() !== ch.name) {
      alert('That is not the channel name — nothing has been deleted.');
      return;
    }
    window.HNA.channels.remove(ch.id).then(function () {
      return window.HNA.clubs().then(function (clubs) {
        state.channels = clubs || [];
        /* Whatever is left, or nothing: the app has a state for no channel
           and this is one of the ways into it. */
        state.channel = state.channels[0] || null;
        return loadMatches(state.channel).then(function () {
          renderShell();
          location.hash = '#/channel';
          route();                                   // same hash when already there
        });
      });
    }).catch(function (e) { alert(e.message || String(e)); });
  }

  /* ---------- one channel: members and invites ---------- */
  function renderChannelOne(view, slug) {
    var ch = ownChannels().filter(function (c) { return c.slug === slug; })[0];
    if (!ch) { location.hash = '#/channel'; return; }

    var back = el('button', 'back', '&larr; All channels');
    back.addEventListener('click', function () { location.hash = '#/channel'; });
    view.appendChild(back);

    var isAdmin = ch.role === 'admin';
    var h = head(esc(ch.name),
      roleLabel(ch.role) + ' · ' + (ch.sport || 'football') + (ch.country ? ' · ' + ch.country : '') +
      (ch.code ? ' · team ' + ch.code : ''));
    if (isAdmin) {
      var right = el('span', 'right');
      right.appendChild(settingsMenu(ch));
      h.appendChild(right);
    }
    view.appendChild(h);
    var body = el('div', 'dcol');
    view.appendChild(body);

    var membersCard = el('div', 'card');
    membersCard.innerHTML = '<p class="card-h">Members</p><div class="state" style="border:0;padding:18px"><div class="spinner"></div></div>';
    body.appendChild(membersCard);

    var invitesCard = null;
    if (isAdmin) {
      invitesCard = el('div', 'card');
      body.appendChild(invitesCard);
    } else {
      body.appendChild(el('p', 'note',
        'Only an admin of this channel can invite people or change what they can see.'));
    }

    /* ---- open to anyone, or not ----
       Last on the page on purpose. It is the only control here that reaches
       past the club, and the confirm spells out what goes with it rather
       than asking "are you sure?". */
    var publicCard = null;
    if (isAdmin) {
      publicCard = el('div', 'card');
      body.appendChild(publicCard);
      drawPublic();
    } else if (ch.isPublic) {
      body.appendChild(el('p', 'note',
        'This channel is public: anyone can read its matches and analyses without an ' +
        'account. Only an admin can close it again.'));
    }

    drawMembers();
    if (isAdmin) drawInvites();

    /* One switch, not two buttons that swap places: the state and the way to
       change it are the same control, so what it is now is never a sentence
       you have to read to find out. Opening it still costs a confirm. */
    function drawPublic() {
      var on = !!ch.isPublic;
      publicCard.innerHTML =
        '<p class="card-h">Who can read this channel ' +
          '<span class="right">' + (on ? 'anyone' : 'members only') + '</span></p>' +
        '<div class="pub-switch">' +
          '<button class="tgl" type="button" id="pubGo" role="switch"' +
            ' aria-checked="' + (on ? 'true' : 'false') + '" aria-labelledby="pubLbl">' +
            '<span class="tgl-track"><span class="tgl-knob"></span></span>' +
          '</button>' +
          '<span class="tgl-txt" id="pubLbl">Public channel<em>' +
            (on ? 'On · anyone can read it' : 'Off · members only') + '</em></span>' +
        '</div>' +
        '<p class="pub-now' + (on ? ' on' : '') + '">' +
          (on
            ? 'Open to anyone. No account needed — the matches, the numbers and the full ' +
              'analyses, including the players named in them.'
            : 'Members only. Nobody outside the list above can open it.') +
        '</p>' +
        '<p class="note">Turning it off stops new readers. It does not take back what ' +
          'somebody already read or saved.</p>';

      publicCard.querySelector('#pubGo').addEventListener('click', function () {
        var btn = publicCard.querySelector('#pubGo');
        if (!on && !confirm(
            'Make ' + ch.name + ' public?\n\n' +
            'Anyone at all will be able to read it without an account:\n' +
            '  · every published match and its score\n' +
            '  · the full analysis of each — every tagged event and where on the pitch\n' +
            '  · the line-ups, with the players\' shirt numbers AND NAMES\n' +
            '  · the opposition in those matches, who did not agree to this\n\n' +
            'You can close it again, but that does not take back what has already ' +
            'been read or saved.')) return;
        btn.disabled = true;
        window.HNA.channels.setPublic(ch.id, !on).then(function (updated) {
          ch.isPublic = updated.isPublic;
          drawPublic();
          renderShell();
        }).catch(function (e) {
          btn.disabled = false;
          alert(e.message || String(e));
        });
      });
    }

    function fail(card, title, err) {
      card.innerHTML = '<p class="card-h">' + title + '</p>' +
        '<p class="note err" style="margin:0">' + esc(err.message || String(err)) + '</p>';
    }

    function drawMembers() {
      window.HNA.channels.members(ch.id).then(function (rows) {
        var cols = '<tr><th>Person</th><th>Role</th><th>Since</th>' + (isAdmin ? '<th></th>' : '') + '</tr>';
        var trs = rows.map(function (m) {
          var me = state.user && m.userId === state.user.id;
          return '<tr>' +
            '<td class="pname">' + esc(m.name || m.email || m.userId.slice(0, 8)) +
              (m.name && m.email ? ' <span class="mono" style="color:var(--ash-dim)">' + esc(m.email) + '</span>' : '') +
              (me ? ' <span class="tag-you">you</span>' : '') + '</td>' +
            '<td>' + (isAdmin
              ? '<select class="rsel" data-user="' + esc(m.userId) + '">' +
                  ['admin', 'analyst', 'viewer'].map(function (r) {
                    return '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + roleLabel(r) + '</option>';
                  }).join('') + '</select>'
              : esc(roleLabel(m.role))) + '</td>' +
            '<td class="mono">' + esc(m.addedAt ? String(m.addedAt).slice(0, 10) : '—') + '</td>' +
            (isAdmin ? '<td><button type="button" class="lnk-rm" data-user="' + esc(m.userId) + '">Remove</button></td>' : '') +
            '</tr>';
        }).join('');

        membersCard.innerHTML =
          '<p class="card-h">Members <span class="right">' + rows.length +
            (rows.length === 1 ? ' person' : ' people') + '</span></p>' +
          '<div class="tbl-scroll"><table class="dt"><thead>' + cols + '</thead><tbody>' + trs + '</tbody></table></div>' +
          (isAdmin ? '<p class="note">An admin can invite, change roles and remove people. ' +
                     'A channel always keeps at least one admin.</p>' : '');

        if (!isAdmin) return;
        membersCard.querySelectorAll('.rsel').forEach(function (sel) {
          sel.addEventListener('change', function () {
            sel.disabled = true;
            window.HNA.channels.setRole(ch.id, sel.getAttribute('data-user'), sel.value)
              .then(drawMembers)
              .catch(function (e) { sel.disabled = false; alert(e.message || String(e)); drawMembers(); });
          });
        });
        membersCard.querySelectorAll('.lnk-rm').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!confirm('Remove this person from ' + ch.name + '? They lose access to the channel immediately.')) return;
            btn.disabled = true;
            window.HNA.channels.removeMember(ch.id, btn.getAttribute('data-user'))
              .then(drawMembers)
              .catch(function (e) { btn.disabled = false; alert(e.message || String(e)); });
          });
        });
      }).catch(function (e) { fail(membersCard, 'Members', e); });
    }

    function drawInvites() {
      window.HNA.channels.invites(ch.id).then(function (rows) {
        var pending = rows.map(function (i) {
          return '<div class="inv"><span class="mono">' + esc(i.email) + '</span>' +
                 '<span class="inv-r">' + esc(roleLabel(i.role)) + '</span>' +
                 '<button type="button" class="lnk-rm" data-inv="' + esc(i.id) + '">Revoke</button></div>';
        }).join('');

        invitesCard.innerHTML =
          '<p class="card-h">Invite someone <span class="right">' + rows.length + ' pending</span></p>' +
          '<form class="inv-form" id="invForm">' +
            '<input type="email" id="invEmail" placeholder="name@club.com" autocomplete="off" required>' +
            '<select id="invRole">' +
              '<option value="viewer">Viewer</option>' +
              '<option value="analyst">Analyst</option>' +
              '<option value="admin">Admin</option>' +
            '</select>' +
            '<button class="btn btn-primary" type="submit">Add invite</button>' +
          '</form>' +
          '<p class="note">Nothing is emailed from here. The invite waits until that address signs ' +
            'in at this site, and the channel is theirs the moment they do — send them the link yourself.</p>' +
          (pending ? '<div class="invs">' + pending + '</div>' : '');

        var form = invitesCard.querySelector('#invForm');
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var btn = form.querySelector('button');
          btn.disabled = true;
          window.HNA.channels.invite(ch.id, form.querySelector('#invEmail').value, form.querySelector('#invRole').value)
            .then(drawInvites)
            .catch(function (err) { btn.disabled = false; alert(err.message || String(err)); });
        });
        invitesCard.querySelectorAll('.lnk-rm').forEach(function (btn) {
          btn.addEventListener('click', function () {
            btn.disabled = true;
            window.HNA.channels.revokeInvite(btn.getAttribute('data-inv'))
              .then(drawInvites)
              .catch(function (err) { btn.disabled = false; alert(err.message || String(err)); });
          });
        });
      }).catch(function (e) { fail(invitesCard, 'Invite someone', e); });
    }
  }

  /* ---------- the new-channel form ---------- */
  var SPORTS = [['football', 'Football']];
  var COUNTRIES = ['Viet Nam','Saint Lucia','Aruba','Barbados','Curaçao','Haiti','Australia','Belgium','Brazil',
    'Canada','China','Denmark','England','France','Germany','India','Indonesia','Italy','Japan','Korea Republic',
    'Malaysia','Mexico','Netherlands','New Zealand','Norway','Philippines','Poland','Portugal','Singapore','Spain',
    'Sweden','Switzerland','Thailand','Turkey','United States','Uruguay'];

  /* The one form. Creating a channel and editing one ask for the same four
     things, so they are the same markup and the same wiring; only the button,
     the heading and what happens on submit differ. Two copies of this drifted
     apart the moment a field was added to one of them. */
  function channelForm(view, opts) {
    var v = opts.values || {};
    var card = el('div', 'card form-card');
    card.innerHTML =
      '<form id="chanForm">' +
        '<div class="field"><label for="ncName">Channel name</label>' +
          '<input id="ncName" placeholder="Enter club name" autocomplete="off" required value="' +
            esc(v.name || '') + '"></div>' +
        '<div class="f2">' +
          '<div class="field"><label for="ncSport">Sport</label>' +
            '<select id="ncSport">' + SPORTS.map(function (s) {
              return '<option value="' + s[0] + '"' + (v.sport === s[0] ? ' selected' : '') + '>' +
                s[1] + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="ncCountry">Country</label>' +
            '<input id="ncCountry" list="countryList" value="' + esc(v.country || 'Viet Nam') + '" autocomplete="off">' +
            '<datalist id="countryList">' + COUNTRIES.map(function (c) {
              return '<option value="' + esc(c) + '"></option>'; }).join('') + '</datalist></div>' +
        '</div>' +
        /* No competition or stage here. A club plays in several over a season —
           a qualifying campaign, a league, a cup — so one of each pinned to the
           channel would be wrong the moment the second one starts. They belong
           to the MATCH, which is where they are already read from: the fixture
           list shows each match's own, and the summary strip simply leaves the
           line out when the channel has none. */
        '<div class="field"><label for="ncCode">Team code <span class="opt">optional</span></label>' +
          '<input id="ncCode" inputmode="numeric" maxlength="5" placeholder="5 digits" ' +
            'autocomplete="off" value="' + esc(v.code || '') + '">' +
          '<p class="field-note" id="ncCodeMsg">The code of this club’s team on the ' +
            'labeling site. It is what tells a published match which of the two sides is yours.</p></div>' +
        '<div class="form-end">' +
          '<button class="btn btn-primary" type="submit" id="ncGo">' + esc(opts.submit) + '</button>' +
          (opts.cancel ? '<button class="btn btn-quiet" type="button" id="ncCancel">Cancel</button>' : '') +
          '<span class="form-msg" id="ncMsg"></span>' +
        '</div>' +
      '</form>';
    view.appendChild(card);
    view.appendChild(el('p', 'note', opts.note));

    var nameBox = card.querySelector('#ncName');
    var codeBox = card.querySelector('#ncCode');
    var codeMsg = card.querySelector('#ncCodeMsg');

    /* A code that names no team is refused by the database (0018), which is
       the guarantee — but being told which team it IS before saving is what
       makes a five-digit number something a person can check. */
    var CODE_HELP = 'The code of this club’s team on the labeling site. It is what ' +
      'tells a published match which of the two sides is yours.';
    var lookupSeq = 0;
    function lookup() {
      var raw = (codeBox.value || '').trim();
      var seq = ++lookupSeq;
      if (!raw) { codeMsg.className = 'field-note'; codeMsg.textContent = CODE_HELP; return; }
      if (!/^\d{5}$/.test(raw)) {
        codeMsg.className = 'field-note';
        codeMsg.textContent = 'A team code is 5 digits, like 10482.';
        return;
      }
      codeMsg.className = 'field-note';
      codeMsg.textContent = 'Looking that code up…';
      window.HNA.teamByCode(raw).then(function (t) {
        if (seq !== lookupSeq) return;             // a later keystroke has overtaken this
        codeMsg.className = 'field-note' + (t ? ' ok' : ' err');
        codeMsg.textContent = t
          ? 'Matches ' + t.name + '. Published matches with this team on one side will read that side as yours.'
          : 'No team on the labeling site has that code. Ask the analyst who tags your matches for it.';
      }).catch(function () {
        if (seq !== lookupSeq) return;
        codeMsg.className = 'field-note';
        codeMsg.textContent = 'That code could not be checked from here — it is still checked when you save.';
      });
    }
    codeBox.addEventListener('input', lookup);
    if (v.code) lookup();

    if (opts.cancel) {
      card.querySelector('#ncCancel').addEventListener('click', opts.cancel);
    }

    card.querySelector('#chanForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var go = card.querySelector('#ncGo'), msg = card.querySelector('#ncMsg');
      go.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = opts.busy;
      opts.save({
        name: nameBox.value,
        sport: card.querySelector('#ncSport').value,
        country: card.querySelector('#ncCountry').value,
        code: codeBox.value
      }).catch(function (err) {
        go.disabled = false;
        msg.className = 'form-msg err';
        msg.textContent = err.message || String(err);
      });
    });
  }

  function renderChannelNew(view) {
    var back = el('button', 'back', '&larr; All channels');
    back.addEventListener('click', function () { location.hash = '#/channel'; });
    view.appendChild(back);
    view.appendChild(head('Create a new channel', 'One channel is one club'));

    channelForm(view, {
      submit: 'Create channel',
      busy: 'Creating…',
      note: 'Creating a channel makes you its admin. Matches reach it when an analyst points a tagged ' +
            'match at it on the labeling site and marks it published.',
      save: function (fields) {
        return window.HNA.channels.create(fields).then(function (created) {
          /* Re-read rather than trusting the row we just wrote: the role
             comes from the membership the database made, not from here.
             Matched on the slug, which this browser generated and which is
             unique — the insert is not asked to return anything, so there is
             no id to match on. See channels.create() for why. */
          return window.HNA.clubs().then(function (clubs) {
            state.channels = clubs || [];
            var mine = state.channels.filter(function (c) { return c.slug === created.slug; })[0];
            if (mine) {
              state.channel = mine;
              return loadMatches(mine).then(function () {
                renderShell();
                location.hash = '#/channel/' + encodeURIComponent(mine.slug);
              });
            }
            location.hash = '#/channel';
          });
        });
      }
    });
  }

  /* ---------- editing one ----------
     Same form, filled in. The slug is not among the fields: it is in every
     link anyone has been sent to this channel, and renaming the club is not
     a reason to break them. */
  function renderChannelEdit(view, slug) {
    var ch = ownChannels().filter(function (c) { return c.slug === slug; })[0];
    if (!ch) { location.hash = '#/channel'; return; }
    var backTo = function () { location.hash = '#/channel/' + encodeURIComponent(ch.slug); };

    var back = el('button', 'back', '&larr; ' + esc(ch.name));
    back.addEventListener('click', backTo);
    view.appendChild(back);
    view.appendChild(head('Channel settings', 'What this channel is called, and which team it is'));

    if (ch.role !== 'admin') {
      view.appendChild(emptyState('Not an admin of this channel',
        'Only an admin can change a channel’s details. Ask whoever runs it.'));
      return;
    }

    channelForm(view, {
      values: ch,
      submit: 'Save changes',
      busy: 'Saving…',
      cancel: backTo,
      note: 'The channel’s web address does not change with its name — links already sent to ' +
            'this channel go on working.',
      save: function (fields) {
        return window.HNA.channels.update(ch.id, fields).then(function () {
          /* Re-read the list: the role comes from the membership, not from
             the row that was just written. */
          return window.HNA.clubs().then(function (clubs) {
            state.channels = clubs || [];
            var mine = state.channels.filter(function (c) { return c.id === ch.id; })[0];
            if (state.channel && state.channel.id === ch.id) state.channel = mine || state.channel;
            /* The team code may have changed which side is the club's, so the
               matches are read again rather than reused. */
            return loadMatches(state.channel).then(function () {
              renderShell();
              location.hash = '#/channel/' + encodeURIComponent((mine || ch).slug);
              route();                              // same hash: nothing would redraw on its own
            });
          });
        });
      }
    });
  }

  /* ---------------------------------------------------------
     Small builders
     --------------------------------------------------------- */
  /* A heading with nothing to say underneath it says nothing: an empty
     .sub would still be a flex item and open a gap after the title. */
  function head(title, sub) {
    return el('div', 'view-head', '<h1>' + title + '</h1>' +
      (sub ? '<span class="sub">' + esc(sub) + '</span>' : ''));
  }
  function kpi(label, value, delta) {
    return '<div class="kpi"><span class="k-l">' + esc(label) + '</span><span class="k-v">' + num(value) + '</span>' +
      (delta ? '<span class="k-d k-flat">' + esc(delta) + '</span>' : '') + '</div>';
  }
  function emptyState(title, body) {
    return el('div', 'state', '<b>' + esc(title) + '</b><p>' + esc(body) + '</p>');
  }
  /* ---------------------------------------------------------
     The rail's width

     Pulled in, the rail is a strip of marks and the view gets the width back;
     pulled out, it names its sections. Which of the two it is outlives the
     page, so it is answered from storage before anything is drawn — restoring
     it after DOMContentLoaded would paint the wide rail first and snap.
     --------------------------------------------------------- */
  var RAIL_KEY = 'hna.rail';
  /* Under 861px the rail is a row across the top of the page with no width to
     give back, so there is nothing to pull in and no name to move into a
     tooltip. Same breakpoint as the stylesheet's. */
  var railWide = window.matchMedia('(min-width:861px)');

  function setRail(pulledIn) {
    document.body.classList.toggle('rail-in', pulledIn);
    var b = $('#railToggle');
    if (b) {
      b.setAttribute('aria-expanded', pulledIn ? 'false' : 'true');
      b.title = pulledIn ? 'Widen the menu' : 'Narrow the menu';
      b.setAttribute('aria-label', b.title);
    }
    /* Pulled in, an entry's name is only in its tooltip. Pulled out — or on a
       phone, where it was never taken away — the name is right there, and a
       tooltip repeating it is noise. */
    var named = pulledIn && railWide.matches;
    document.querySelectorAll('.side a > span').forEach(function (s) {
      if (named) s.parentNode.title = s.textContent.trim();
      else s.parentNode.removeAttribute('title');
    });
    try { localStorage.setItem(RAIL_KEY, pulledIn ? 'in' : 'out'); } catch (e) {}
  }
  function restoreRail() {
    var saved = null;
    try { saved = localStorage.getItem(RAIL_KEY); } catch (e) {}
    setRail(saved === 'in');
  }
  /* crossing the breakpoint with the rail pulled in changes whether the names
     are on screen, so the tooltips are worked out again */
  railWide.addEventListener('change', function () {
    setRail(document.body.classList.contains('rail-in'));
  });
  /* runs as the script does, not on DOMContentLoaded: the rail is already
     parsed by here, and this lands before the first paint */
  restoreRail();

  /* ---------------------------------------------------------
     Wiring
     --------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var wrap = $('#chanWrap');
    $('#chanBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', function () { wrap.classList.remove('open'); });

    var pull = $('#railToggle');
    if (pull) pull.addEventListener('click', function () {
      setRail(!document.body.classList.contains('rail-in'));
    });

    $('#signOut').addEventListener('click', function () {
      window.HNA.auth.signOut().then(function () { location.href = 'login.html'; });
    });

    /* [data-view] only: the About link at the foot of the rail leaves the
       app for the public site, so it must stay an ordinary link. */
    document.querySelectorAll('.side a[data-view]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        location.hash = '#/' + a.getAttribute('data-view');
      });
    });

    window.addEventListener('hashchange', route);
    boot();
  });
})();
