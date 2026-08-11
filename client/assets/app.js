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
    state.reports = null; state.reportsFor = null; reportJob = null;
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
    $('#chanPublic').hidden = !(ch && ch.isPublic);

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
    view.innerHTML = '';
    if (parts[0] === 'match' && parts[1]) {
      var slug = decodeURIComponent(parts[1]);
      /* /stats is kept as a suffix so links made while there were two
         tabs still land on the one page there is now. */
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
    var list = el('div', 'mlist');
    list.appendChild(el('div', 'mlist-h',
      '<span>Date</span><span>Home</span><span style="text-align:center">Final score</span>' +
      '<span>Away</span><span style="text-align:right">Result</span>'));

    state.matches.forEach(function (m) {
      /* One page per match again, so the row is a plain button: there is no
         second thing inside it to aim somewhere else. */
      var b = el('button', 'mrow');
      b.type = 'button';
      var ourHome = m.side === 'home';
      b.innerHTML =
        '<span class="m-date">' + esc(m.dateLabel) + '<em>' + esc(m.venue || (ourHome ? 'Home' : 'Away')) +
          ' · Match ID ' + esc(m.id) + '</em></span>' +
        '<span class="m-team m-home">' +
          '<span class="tn' + (ourHome ? ' us' : '') + '">' + esc(m.home.name) + '</span>' +
        '</span>' +
        '<span class="m-sc"><span class="m-score">' +
          num(m.home.score) + ' : ' + num(m.away.score) + '</span></span>' +
        '<span class="m-team m-away">' +
          '<span class="tn' + (ourHome ? '' : ' us') + '">' + esc(m.away.name) + '</span>' +
        '</span>' +
        '<span class="m-end">' +
          (m.result ? '<span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span>' : '') +
          '<span class="m-open" aria-hidden="true">' +
            '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M1 0 9 5 1 10Z"/></svg>' +
          '</span>' +
        '</span>';
      b.addEventListener('click', function () {
        location.hash = '#/match/' + encodeURIComponent(m.slug || m.id);
      });
      list.appendChild(b);
    });
    view.appendChild(list);
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
      window.PTStats.mount(holder, rep.payload, {});
      /* the PDF button is part of the chrome that mount() just drew, so it did
         not exist when report.js ran */
      if (window.PTReport && window.PTReport.bind) window.PTReport.bind();
    }).catch(function (e) {
      if (!holder.parentNode) return;
      holder.innerHTML = '';
      holder.appendChild(emptyState('The analysis could not be opened',
        (e && e.message) || String(e)));
    });
  }

  /* ---------------------------------------------------------
     View: data (campaign aggregates)

     Two sections behind one heading:

       Overview   what the campaign came to — the record, the last five
                  results, who put the numbers on the board
       Team Data  one row per match, four categories of columns

     Both are worked out from the reports Submit Analysis froze, through the
     same computeStats()/sumTeam()/TEAM_SECTIONS shared.js gives the match
     page. That is the whole point: a figure here and the same figure on the
     match page come out of one implementation, so they cannot drift apart.

     Which section is open lives in the hash — #/data/team/defensive is a
     link somebody can send — so route() redraws on a tab click and the
     signature stays renderData(view).
     --------------------------------------------------------- */
  var TD_TABS = [
    /* key, what the tab says, which of shared.js's TEAM_SECTIONS it draws */
    ['shooting',     'Shooting',     'Attacking Stats'],
    ['distribution', 'Distribution', 'Distribution Stats'],
    ['defensive',    'Defensive',    'Defensive Stats'],
    ['other',        'Other',        'Discipline & GK']
  ];

  function renderData(view) {
    if (!state.channel) return view.appendChild(noChannel());

    var rest = location.hash.replace(/^#\/?/, '').split('/').slice(1);
    var onTeam = rest[0] === 'team';
    var cat = onTeam && TD_TABS.some(function (t) { return t[0] === rest[1]; }) ? rest[1] : 'shooting';

    /* No strapline: the two tabs under the title say what the page is, and
       head() draws nothing where there is nothing to say. */
    view.appendChild(head('Data'));
    view.appendChild(dataTabs(onTeam));

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
      if (onTeam) renderTeamData(body, cat); else renderOverview(body);
    }).catch(function (e) {
      if (!body.parentNode) return;
      body.innerHTML = '';
      body.appendChild(emptyState('The submitted analyses could not be read',
        (e && e.message) || String(e)));
    });
  }

  function dataTabs(onTeam) {
    var bar = el('div', 'dtabs');
    [['overview', 'Overview'], ['team', 'Team Data']].forEach(function (t) {
      var b = el('button', 'dtab' + ((t[0] === 'team') === !!onTeam ? ' on' : ''), t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { location.hash = '#/data/' + t[0]; });
      bar.appendChild(b);
    });
    return bar;
  }

  function catTabs(cat) {
    var bar = el('div', 'dsubs');
    TD_TABS.forEach(function (t) {
      var b = el('button', 'chip' + (t[0] === cat ? ' on' : ''), t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { location.hash = '#/data/team/' + t[0]; });
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
    return {
      m: m,
      gf: (m.side === 'home' ? m.home.score : m.away.score) || 0,
      ga: (m.side === 'home' ? m.away.score : m.home.score) || 0,
      us: window.sumTeam(rep.rows, m.side),
      them: window.sumTeam(rep.rows, other),
      players: window.computeStats(rep.rows, m.side),
      names: window.squadNames(rep.lineups || {}, m.side)
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
    var stat = el('div', 'card stat-card');
    stat.innerHTML =
      '<p class="card-h">Team stats <span class="right">' + esc(state.channel ? state.channel.name : '') + '</span></p>' +
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
    'Ground Duels': 'Duels', 'Ground Duels Won': 'Duels',
    'Corners': 'Set Pieces', 'Free-kicks': 'Set Pieces', 'Penalty Kicks': 'Set Pieces',
    'Throw-ins': 'Set Pieces', 'Goal Kicks': 'Set Pieces',
    'Fouls': 'Discipline', 'Offsides': 'Discipline'
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
    var top = '<th class="c-date" rowspan="2">Date</th>' +
              '<th class="c-opp" rowspan="2">Opposing team</th>' +
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

  /* The stat engine on its own: computeStats, sumTeam, TEAM_SECTIONS, pct.
     The Data view needs those and nothing else — no spreadsheet library, no
     renderers, and none of the tagging app's stylesheets, which would land
     their own :root on this page for the sake of a table it does not draw.
     Same URL as the line below, so whichever view is opened first is the one
     that pays for it. */
  function loadShared() {
    return loadOnce(taggerRoot() + 'shared.js?v=18');
  }

  /* Pulled in the first time someone opens a match's stats, not on every page
     load — the spreadsheet library alone is larger than this whole site. */
  function loadStatsView() {
    var r = taggerRoot();
    loadOnce(r + 'shared.css?v=13', 'css');
    loadOnce(r + 'Stats/stats-view.css?v=2', 'css');
    return loadOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
      .then(function () { return loadShared(); })
      .then(function () { return loadOnce(r + 'Stats/stats-view.js?v=3'); })
      .then(function () { return loadOnce(r + 'Stats/report.js?v=30'); });
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
     Wiring
     --------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var wrap = $('#chanWrap');
    $('#chanBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', function () { wrap.classList.remove('open'); });

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
