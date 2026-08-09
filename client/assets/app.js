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

  var state = { user: null, channels: [], channel: null, matches: [], loading: true };

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
    if (!ch) { state.matches = []; return Promise.resolve(); }
    return window.HNA.matches(ch.id).then(function (rows) {
      state.matches = rows || [];
    }).catch(function () { state.matches = []; });
  }

  /* ---------------------------------------------------------
     Shell: channel switcher, account, nav
     --------------------------------------------------------- */
  function renderShell() {
    var ch = state.channel;
    $('#chanCrest').textContent = ch ? ch.crest : '···';
    $('#chanName').textContent = ch ? ch.name : (state.user ? 'No channel' : 'Not signed in');
    $('#chanPublic').hidden = !(ch && ch.isPublic);

    var menu = $('#chanMenu');
    menu.innerHTML = '';
    state.channels.forEach(function (c) {
      var b = el('button', 'chan-opt' + (c === ch ? ' on' : ''),
        '<span class="crest sm' + (c === ch ? '' : ' opp') + '">' + esc(c.crest) + '</span>' +
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
          '<span class="crest sm' + (ourHome ? '' : ' opp') + '">' + esc(m.home.crest) + '</span>' +
          '<span class="tn' + (ourHome ? ' us' : '') + '">' + esc(m.home.name) + '</span>' +
        '</span>' +
        '<span class="m-sc"><span class="m-score">' +
          num(m.home.score) + ' : ' + num(m.away.score) + '</span></span>' +
        '<span class="m-team m-away">' +
          '<span class="crest sm' + (ourHome ? ' opp' : '') + '">' + esc(m.away.crest) + '</span>' +
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
     --------------------------------------------------------- */
  function renderData(view) {
    if (!state.channel) return view.appendChild(noChannel());
    view.appendChild(head('Data', 'Every published match in this channel, added up'));

    var all = state.matches;
    if (!all.length) {
      view.appendChild(emptyState('Nothing to add up yet',
        'Aggregates appear once there is at least one published match in this channel.'));
      return;
    }

    /* ---- team stats + recent results + the last formation ---- */
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

    var top = el('div', 'dgrid');
    var left = el('div', 'dcol');

    var stat = el('div', 'card');
    stat.innerHTML =
      '<p class="card-h">Team stats <span class="right">' + esc(state.channel ? state.channel.name : '') + '</span></p>' +
      '<div class="tstats">' +
        tstat('Total', played.length) + tstat('Win', w) + tstat('Draw', d) + tstat('Loss', l) +
      '</div>' +
      '<div class="tstats sec">' +
        tstat('Average goals scored', avg(gf)) +
        tstat('Average goals conceded', avg(ga)) +
        tstat('Goal difference', (gf - ga > 0 ? '+' : '') + (gf - ga)) +
      '</div>';
    left.appendChild(stat);

    /* Most recent first — the list is kept in kickoff order for the
       fixture list, which reads the other way round. */
    var recent = played.slice().reverse().slice(0, 6);
    var res = el('div', 'card');
    res.innerHTML = '<p class="card-h">Recent match results <span class="right">latest ' + recent.length + '</span></p>';
    var rl = el('div', 'rlist');
    recent.forEach(function (m) {
      var b = el('button', 'rrow');
      b.type = 'button';
      b.innerHTML =
        '<span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span>' +
        '<span class="rn' + (m.side === 'home' ? ' us' : '') + '">' + esc(m.home.name) + '</span>' +
        '<span class="rsc">' + num(m.home.score) + '</span>' +
        '<span class="rsc">' + num(m.away.score) + '</span>' +
        '<span class="rn' + (m.side === 'away' ? ' us' : '') + '">' + esc(m.away.name) + '</span>' +
        '<span class="rd">' + esc(m.dateLabel) + '</span>';
      b.addEventListener('click', function () { location.hash = '#/match/' + encodeURIComponent(m.slug || m.id); });
      rl.appendChild(b);
    });
    res.appendChild(rl);
    left.appendChild(res);
    top.appendChild(left);
    top.appendChild(formationCard(all));
    view.appendChild(top);

    var ms = all.filter(function (m) { return m.us; });
    if (!ms.length) {
      view.appendChild(el('p', 'note',
        'Per-match numbers appear once the matches in this channel carry tagged events.'));
      return;
    }

    var sum = function (k) {
      var t = 0, any = false;
      ms.forEach(function (m) { if (m.us[k] != null) { t += Number(m.us[k]); any = true; } });
      return any ? t : null;
    };
    var shots = sum('shots'), onT = sum('onTarget');
    var passes = sum('passes'), done = sum('passesDone');

    var kpis = el('div', 'kpis');
    kpis.innerHTML =
      kpi('Matches tagged', ms.length, 'of ' + all.length + ' in this channel') +
      kpi('Goals for', sum('goals'), 'across the campaign') +
      kpi('Goals against', ga, '') +
      kpi('Shots', shots, onT != null ? onT + ' on target' : '') +
      (passes ? kpi('Passes', passes, done != null ? Math.round(done / passes * 1000) / 10 + '% completed' : '') : '');
    view.appendChild(kpis);

    /* per-match table of the club's own column */
    var COLS = [
      ['poss', 'Poss %'], ['shots', 'Shots'], ['onTarget', 'On tgt'], ['goals', 'Goals'],
      ['passes', 'Passes'], ['passAcc', 'Pass %'], ['crosses', 'Crosses'], ['crossesDone', 'Cr. done'],
      ['recoveries', 'Recov.'], ['tackles', 'Tackles'], ['tackleAcc', 'Tkl %'],
      ['interceptions', 'Int.'], ['clearances', 'Clear.'], ['aerialWon', 'Aer. won'], ['mistakes', 'Mist.']
    ].filter(function (c) { return ms.some(function (m) { return m.us[c[0]] != null; }); });

    var card = el('div', 'card');
    var thead = '<tr><th>Match</th><th>Res</th>' + COLS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr>';
    var tbody = ms.map(function (m) {
      return '<tr><td class="pname">v ' + esc(m.opponent) + ' <span class="mono" style="color:var(--ash-dim)">(' +
        (m.side === 'home' ? 'H' : 'A') + ')</span></td>' +
        '<td>' + (m.result || '—') + '</td>' +
        COLS.map(function (c) { return '<td>' + num(m.us[c[0]]) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var totals = '<tr><td class="pname"><b>Campaign</b></td><td>—</td>' +
      COLS.map(function (c) {
        if (/Acc$|^poss$/.test(c[0])) return '<td>—</td>';
        var t = sum(c[0]);
        return '<td><b>' + num(t) + '</b></td>';
      }).join('') + '</tr>';
    card.innerHTML = '<p class="card-h">Per match <span class="right">the club\'s own column</span></p>' +
      '<div class="tbl-scroll"><table class="dt"><thead>' + thead + '</thead><tbody>' + tbody + totals + '</tbody></table></div>' +
      '<p class="note">Percentages are per match and are not averaged in the campaign row — a mean of ratios would be misleading.</p>';
    view.appendChild(card);
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

  /* Pulled in the first time someone opens a match's stats, not on every page
     load — the spreadsheet library alone is larger than this whole site. */
  function loadStatsView() {
    var r = taggerRoot();
    loadOnce(r + 'shared.css?v=13', 'css');
    loadOnce(r + 'Stats/stats-view.css?v=1', 'css');
    return loadOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
      .then(function () { return loadOnce(r + 'shared.js?v=18'); })
      .then(function () { return loadOnce(r + 'Stats/stats-view.js?v=1'); })
      .then(function () { return loadOnce(r + 'Stats/report.js?v=29'); });
  }

  /* ---------------------------------------------------------
     Data view pieces
     --------------------------------------------------------- */
  function tstat(label, value) {
    return '<div class="tstat"><span class="ts-l">' + esc(label) + '</span>' +
           '<span class="ts-v">' + num(value) + '</span></div>';
  }

  /* The starting XI the analyst entered on the labeling site, drawn where
     they put it. x/y are percentages of a 105:68 pitch, which is exactly
     what the tagger stores, so nothing is recomputed here. */
  function formationCard(matches) {
    var card = el('div', 'card fm-card');
    var m = null;
    for (var i = matches.length - 1; i >= 0; i--) {
      var lu = matches[i].lineup;
      if (lu && lu.xi && lu.xi.length) { m = matches[i]; break; }
    }
    if (!m) {
      card.innerHTML = '<p class="card-h">Recent formation</p>' +
        '<p class="note" style="margin:0">No starting line-up has been entered for a match in this channel yet.</p>';
      return card;
    }

    var lu = m.lineup;
    var names = {};
    (lu.roster || []).forEach(function (p) { names[String(p.no)] = p.name || ''; });

    var dots = lu.xi.map(function (p) {
      var x = Math.max(4, Math.min(96, Number(p.x)));
      var y = Math.max(6, Math.min(94, Number(p.y)));
      if (isNaN(x) || isNaN(y)) return '';
      var nm = names[String(p.no)];
      return '<span class="fm-dot" style="left:' + x + '%;top:' + y + '%">' +
             '<b>' + esc(p.no) + '</b>' + (nm ? '<em>' + esc(nm) + '</em>' : '') + '</span>';
    }).join('');

    var subs = (lu.subs || []).map(function (n) {
      return '<span class="fm-sub"><b>' + esc(n) + '</b>' + esc(names[String(n)] || '') + '</span>';
    }).join('');

    card.innerHTML =
      '<p class="card-h">Recent formation <span class="right">' +
        esc(m.home.name) + ' ' + num(m.home.score) + ' : ' + num(m.away.score) + ' ' + esc(m.away.name) +
      '</span></p>' +
      '<div class="fm-pitch">' + PITCH_SVG + dots + '</div>' +
      '<p class="fm-meta">' + esc(m.dateLabel) + ' · ' + lu.xi.length + ' starters' +
        (lu.dir === 'rl' ? ' · attacking right to left' : ' · attacking left to right') + '</p>' +
      (subs ? '<div class="fm-subs">' + subs + '</div>' : '');
    return card;
  }

  var PITCH_SVG =
    '<svg viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="0.4" y="0.4" width="104.2" height="67.2" fill="none"/>' +
      '<line x1="52.5" y1="0.4" x2="52.5" y2="67.6"/>' +
      '<circle cx="52.5" cy="34" r="9.15" fill="none"/>' +
      '<rect x="0.4" y="13.85" width="16.5" height="40.3" fill="none"/>' +
      '<rect x="88.1" y="13.85" width="16.5" height="40.3" fill="none"/>' +
      '<rect x="0.4" y="24.85" width="5.5" height="18.3" fill="none"/>' +
      '<rect x="99.1" y="24.85" width="5.5" height="18.3" fill="none"/>' +
    '</svg>';

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
        '<span class="crest sm">' + esc(c.crest) + '</span>' +
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

  /* ---------- one channel: members and invites ---------- */
  function renderChannelOne(view, slug) {
    var ch = ownChannels().filter(function (c) { return c.slug === slug; })[0];
    if (!ch) { location.hash = '#/channel'; return; }

    var back = el('button', 'back', '&larr; All channels');
    back.addEventListener('click', function () { location.hash = '#/channel'; });
    view.appendChild(back);

    view.appendChild(head(esc(ch.name),
      roleLabel(ch.role) + ' · ' + (ch.sport || 'football') + (ch.country ? ' · ' + ch.country : '')));

    var isAdmin = ch.role === 'admin';
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

  function renderChannelNew(view) {
    var back = el('button', 'back', '&larr; All channels');
    back.addEventListener('click', function () { location.hash = '#/channel'; });
    view.appendChild(back);
    view.appendChild(head('Create a new channel', 'One channel is one club'));

    var card = el('div', 'card form-card');
    card.innerHTML =
      '<form id="newChan">' +
        '<div class="crest-pick"><span class="crest lg" id="crestPrev">···</span>' +
          '<span class="cp-note">The three letters shown wherever the club appears. ' +
          'Left alone, they are taken from the name.</span></div>' +
        '<div class="field"><label for="ncName">Channel name</label>' +
          '<input id="ncName" placeholder="Enter club name" autocomplete="off" required></div>' +
        '<div class="f2">' +
          '<div class="field"><label for="ncSport">Sport</label>' +
            '<select id="ncSport">' + SPORTS.map(function (s) {
              return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="ncCountry">Country</label>' +
            '<input id="ncCountry" list="countryList" value="Viet Nam" autocomplete="off">' +
            '<datalist id="countryList">' + COUNTRIES.map(function (c) {
              return '<option value="' + esc(c) + '"></option>'; }).join('') + '</datalist></div>' +
        '</div>' +
        /* No competition or stage here. A club plays in several over a season —
           a qualifying campaign, a league, a cup — so one of each pinned to the
           channel would be wrong the moment the second one starts. They belong
           to the MATCH, which is where they are already read from: the fixture
           list shows each match's own, and the summary strip simply leaves the
           line out when the channel has none. */
        '<div class="field"><label for="ncCrest">Monogram <span class="opt">optional</span></label>' +
          '<input id="ncCrest" maxlength="4" placeholder="auto" autocomplete="off"></div>' +
        '<div class="form-end">' +
          '<button class="btn btn-primary" type="submit" id="ncGo">Create channel</button>' +
          '<span class="form-msg" id="ncMsg"></span>' +
        '</div>' +
      '</form>';
    view.appendChild(card);
    view.appendChild(el('p', 'note',
      'Creating a channel makes you its admin. Matches reach it when an analyst points a tagged ' +
      'match at it on the labeling site and marks it published.'));

    var nameBox = card.querySelector('#ncName');
    var crestBox = card.querySelector('#ncCrest');
    var prev = card.querySelector('#crestPrev');
    var sync = function () {
      var c = (crestBox.value || '').trim().toUpperCase();
      prev.textContent = c || (nameBox.value ? window.HNA.monogram(nameBox.value) : '···');
    };
    nameBox.addEventListener('input', sync);
    crestBox.addEventListener('input', sync);

    card.querySelector('#newChan').addEventListener('submit', function (e) {
      e.preventDefault();
      var go = card.querySelector('#ncGo'), msg = card.querySelector('#ncMsg');
      go.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = 'Creating…';
      window.HNA.channels.create({
        name: nameBox.value,
        crest: crestBox.value,
        sport: card.querySelector('#ncSport').value,
        country: card.querySelector('#ncCountry').value
      }).then(function (created) {
        /* Re-read rather than trusting the row we just wrote: the role
           comes from the membership the database made, not from here. */
        return window.HNA.clubs().then(function (clubs) {
          state.channels = clubs || [];
          var mine = state.channels.filter(function (c) { return c.id === created.id; })[0];
          if (mine) {
            state.channel = mine;
            return loadMatches(mine).then(function () {
              renderShell();
              location.hash = '#/channel/' + encodeURIComponent(mine.slug);
            });
          }
          location.hash = '#/channel';
        });
      }).catch(function (err) {
        go.disabled = false;
        msg.className = 'form-msg err';
        msg.textContent = err.message || String(err);
      });
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
