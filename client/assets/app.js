/* ============================================================
   Client app — channels, matches, data, players.

   A channel is a club. Channels come from Supabase when the person
   is signed in and belongs to one; the Saint Lucia seed channel is
   always there so the app is never an empty room.
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
    var seed = window.HNA_SEED;
    var seedChannel = {
      id: seed.club.id, slug: seed.club.slug, name: seed.club.name, crest: seed.club.crest,
      competition: seed.club.competition, stage: seed.club.stage, seed: true,
      matches: seed.matches, contributors: seed.contributors
    };

    var ready = (window.HNA && window.HNA.configured())
      ? window.HNA.auth.user().catch(function () { return null; })
      : Promise.resolve(null);

    state.seedChannel = seedChannel;

    ready.then(function (user) {
      state.user = user;
      if (!user) return [];
      /* An invite written before this person had an account only turns
         into a membership once they sign in, so it is claimed before the
         channel list is read — otherwise the channel they were invited
         to would not appear until the next load. */
      return window.HNA.channels.claim().then(function () { return window.HNA.clubs(); });
    }).then(function (clubs) {
      state.channels = (clubs || []).map(function (c) { return Object.assign({}, c, { seed: false }); });
      state.channels.push(seedChannel);
      var wanted = new URLSearchParams(location.search).get('club');
      state.channel = state.channels.filter(function (c) { return c.slug === wanted; })[0] || state.channels[0];
      return loadMatches(state.channel);
    }).then(function () {
      state.loading = false;
      renderShell();
      route();
    }).catch(function (err) {
      state.loading = false;
      state.channels = [seedChannel];
      state.channel = seedChannel;
      state.matches = seedChannel.matches;
      renderShell();
      route();
      if (window.console) console.warn('Falling back to the seed channel:', err);
    });
  }

  function loadMatches(ch) {
    if (!ch) { state.matches = []; return Promise.resolve(); }
    if (ch.seed) { state.matches = ch.matches; return Promise.resolve(); }
    return window.HNA.matches(ch.id).then(function (rows) {
      state.matches = rows || [];
    }).catch(function () { state.matches = []; });
  }

  /* ---------------------------------------------------------
     Shell: channel switcher, account, summary strip, nav
     --------------------------------------------------------- */
  function renderShell() {
    var ch = state.channel;
    $('#chanCrest').textContent = ch.crest;
    $('#chanName').textContent = ch.name;

    var menu = $('#chanMenu');
    menu.innerHTML = '';
    state.channels.forEach(function (c) {
      var b = el('button', 'chan-opt' + (c === ch ? ' on' : ''),
        '<span class="crest sm' + (c === ch ? '' : ' opp') + '">' + esc(c.crest) + '</span>' +
        '<span>' + esc(c.name) + '<em>' + esc(c.seed ? 'sample channel · from the match reports' : (c.stage || c.competition || 'live channel')) + '</em></span>');
      b.type = 'button';
      b.addEventListener('click', function () {
        state.channel = c;
        $('#chanWrap').classList.remove('open');
        loadMatches(c).then(function () { renderShell(); location.hash = '#/matches'; route(); });
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
      who.innerHTML = 'Not signed in<b>viewing the sample channel</b>';
      $('#avatar').textContent = '?';
      $('#signOut').hidden = true;
      $('#signIn').hidden = false;
    }

    renderSummary();
  }

  function renderSummary() {
    var box = $('#chanSum');
    var ch = state.channel;
    var ms = state.matches.filter(function (m) { return m.result; });
    var w = ms.filter(function (m) { return m.result === 'W'; }).length;
    var d = ms.filter(function (m) { return m.result === 'D'; }).length;
    var l = ms.filter(function (m) { return m.result === 'L'; }).length;
    var gf = 0, ga = 0;
    state.matches.forEach(function (m) {
      var our = m.side === 'home' ? m.home.score : m.away.score;
      var their = m.side === 'home' ? m.away.score : m.home.score;
      if (our != null) gf += our;
      if (their != null) ga += their;
    });
    var bits = [];
    if (ch.competition) bits.push('<span>' + esc(ch.competition) + (ch.stage ? ' <span class="sep">·</span> ' + esc(ch.stage) : '') + '</span>');
    bits.push('<span>Played <b>' + state.matches.length + '</b></span>');
    if (ms.length) {
      bits.push('<span>W <b>' + w + '</b></span><span>D <b>' + d + '</b></span><span>L <b>' + l + '</b></span>');
      bits.push('<span>GF <b>' + gf + '</b></span><span>GA <b>' + ga + '</b></span>');
      bits.push('<span>Pts <b>' + (w * 3 + d) + '</b></span>');
    }
    if (ch.seed) bits.push('<span class="badge-seed">Sample data</span>');
    box.innerHTML = bits.join('');
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
      return parts[2] === 'stats' ? renderMatchStats(view, slug) : renderMatch(view, slug);
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
    view.appendChild(head('Matches', state.matches.length
      ? state.matches.length + ' analysed · ' + (state.channel.stage || state.channel.competition || '')
      : 'Nothing published in this channel yet'));

    if (!state.matches.length) {
      view.appendChild(emptyState(
        'No matches published yet',
        state.user
          ? 'Once an analyst points a tagged match at this channel and marks it published, it appears here within seconds.'
          : 'Sign in to see your club\'s channel. The sample channel is open to everyone.'
      ));
      return;
    }

    var list = el('div', 'mlist');
    list.appendChild(el('div', 'mlist-h',
      '<span>Date</span><span>Fixture</span><span>Details</span><span style="text-align:right">Result</span>'));

    state.matches.forEach(function (m) {
      /* A row with a control inside it, so it cannot stay a <button>: the row
         opens the match, the ▶ on the end opens its analysis. */
      var b = el('div', 'mrow');
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      var ourHome = m.side === 'home';
      b.innerHTML =
        '<span class="m-date">' + esc(m.dateLabel) + '<em>' + esc(m.venue || (ourHome ? 'Home' : 'Away')) +
          ' · Match ID ' + esc(m.id) + '</em></span>' +
        '<span class="m-fix">' +
          '<span class="crest sm' + (ourHome ? '' : ' opp') + '">' + esc(m.home.crest) + '</span>' +
          '<span class="tn' + (ourHome ? ' us' : '') + '">' + esc(m.home.name) + '</span>' +
          '<span class="m-score">' + num(m.home.score) + ' : ' + num(m.away.score) + '</span>' +
          '<span class="crest sm' + (ourHome ? ' opp' : '') + '">' + esc(m.away.crest) + '</span>' +
          '<span class="tn' + (ourHome ? '' : ' us') + '">' + esc(m.away.name) + '</span>' +
        '</span>' +
        '<span class="m-det"><b>' + esc(m.competition || state.channel.competition || '') + '</b><br>' +
          esc(m.stage || state.channel.stage || '') + '</span>' +
        '<span class="m-end">' +
          (m.result ? '<span class="res ' + m.result.toLowerCase() + '">' + m.result + '</span>' : '') +
          '<button type="button" class="m-open" title="Open the analysis" aria-label="Open the analysis">' +
            '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M1 0 9 5 1 10Z"/></svg>' +
          '</button>' +
        '</span>';
      var href = '#/match/' + encodeURIComponent(m.slug || m.id);
      var open = function () { location.hash = href; };
      b.addEventListener('click', open);
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      b.querySelector('.m-open').addEventListener('click', function (e) {
        e.stopPropagation();                 // the row would otherwise open too
        location.hash = href + '/stats';
      });
      list.appendChild(b);
    });
    view.appendChild(list);

    if (state.channel.seed) {
      view.appendChild(el('p', 'note',
        'Every figure in this channel was read out of the four match reports produced on the labeling site. ' +
        'Nothing on this page is estimated.'));
    }
  }

  /* ---------------------------------------------------------
     View: one match
     --------------------------------------------------------- */
  function renderMatch(view, slug) {
    var m = state.matches.filter(function (x) { return String(x.slug || x.id) === slug; })[0];
    if (!m) { location.hash = '#/matches'; return; }

    var back = el('button', 'back', '&larr; All matches');
    back.addEventListener('click', function () { location.hash = '#/matches'; });
    view.appendChild(back);

    view.appendChild(matchHead(m));
    view.appendChild(matchTabs(m, 'overview'));

    /* timeline */
    if (m.timeline && m.timeline.length) {
      var c = el('div', 'card');
      c.style.marginBottom = '16px';
      var marks = m.timeline.map(function (t) {
        var cls = t.type === 'goal' ? (t.side === 'us' ? 'us' : 'them')
                : (t.type === 'red' ? 'red' : 'card');
        return '<span class="tl-mk ' + cls + '" style="left:' + Math.min(99, Math.max(1, t.at)) + '%" title="' + esc(t.text) + '">' +
               (t.type === 'goal' ? '⚽' : '') + '</span>';
      }).join('');
      c.innerHTML =
        '<p class="card-h">Timeline <span class="right">goals · cards</span></p>' +
        '<div class="tl"><span class="tl-line"></span><span class="tl-half"></span>' + marks +
        '<span class="tl-ax mono"><span>0\'</span><span>HT</span><span>FT</span></span></div>';
      var evs = el('div', 'evlist');
      evs.style.marginTop = '14px';
      m.timeline.forEach(function (t) {
        var ic = t.type === 'goal' ? (t.side === 'us' ? 'goal-us' : 'goal-them') : t.type;
        evs.appendChild(el('div', 'ev' + (t.type === 'goal' ? ' goal' : ''),
          '<span class="t">' + esc(String(t.text).split(' ')[0]) + '</span>' +
          '<span class="ic ' + ic + '"></span>' +
          '<span class="tx">' + esc(String(t.text).replace(/^\S+\s/, '')) + '</span>'));
      });
      c.appendChild(evs);
      view.appendChild(c);
    }

    /* head to head */
    var grid = el('div', 'grid2');
    var usName = m.side === 'home' ? m.home.name : m.away.name;
    var themName = m.side === 'home' ? m.away.name : m.home.name;

    var METRICS = [
      ['poss', 'Possession', '%'], ['shots', 'Shots', ''], ['onTarget', 'On target', ''],
      ['shotAcc', 'Shot acc.', '%'], ['passes', 'Passes', ''], ['passAcc', 'Pass acc.', '%'],
      ['crosses', 'Crosses', ''], ['recoveries', 'Recoveries', ''], ['tackles', 'Tackles', ''],
      ['interceptions', 'Interceptions', ''], ['clearances', 'Clearances', ''], ['mistakes', 'Mistakes', '']
    ];
    var cmp = el('div', 'card');
    var rows = '';
    if (m.us && m.them) {
      METRICS.forEach(function (mt) {
        var a = m.us[mt[0]], b = m.them[mt[0]];
        if (a == null || b == null) return;
        var tot = (Number(a) + Number(b)) || 1;
        rows += '<div class="cmp-row">' +
          '<span class="v-l">' + a + mt[2] + '</span>' +
          '<span class="cmp-bar l"><i data-w="' + Math.round(a / tot * 100) + '"></i></span>' +
          '<span class="lbl">' + mt[1] + '</span>' +
          '<span class="cmp-bar r"><i data-w="' + Math.round(b / tot * 100) + '"></i></span>' +
          '<span class="v-r">' + b + mt[2] + '</span></div>';
      });
    }
    cmp.innerHTML = '<p class="card-h">Head to head <span class="right">' + esc(usName) + ' vs ' + esc(themName) + '</span></p>' +
      (rows ? '<div class="cmp">' + rows + '</div>'
            : '<p class="note" style="margin:0">No aggregated numbers for this match yet.</p>');
    grid.appendChild(cmp);

    /* shot breakdown */
    var shot = el('div', 'card');
    if (m.us && m.us.shots != null) {
      var s = m.us, tot = s.shots || 1;
      var bar = function (label, v) {
        if (v == null) return '';
        return '<div class="pct-item"><span class="cap">' + label + ' <b>' + v + '</b></span>' +
               '<span class="pct-track"><i data-w="' + Math.round(v / tot * 100) + '"></i></span></div>';
      };
      shot.innerHTML = '<p class="card-h">Where the ' + s.shots + ' shots went <span class="right">' + esc(usName) + '</span></p>' +
        '<div class="cmp" style="gap:14px">' +
          bar('On target', s.onTarget) + bar('Off target', s.offTarget) +
          bar('Blocked', s.blocked) + bar('Missed', s.missed) +
        '</div>' +
        '<div class="kpis" style="margin:18px 0 0">' +
          '<div class="kpi"><span class="k-l">Goals</span><span class="k-v">' + num(s.goals) + '</span><span class="k-d k-flat">from ' + s.shots + ' shots</span></div>' +
          (s.shotAcc != null ? '<div class="kpi"><span class="k-l">Shot accuracy</span><span class="k-v">' + s.shotAcc + '%</span><span class="k-d k-flat">' + esc(themName) + ' ' + num(m.them && m.them.shotAcc) + '%</span></div>' : '') +
          (s.crossesDone != null ? '<div class="kpi"><span class="k-l">Crosses done</span><span class="k-v">' + s.crossesDone + '</span><span class="k-d k-flat">of ' + num(s.crosses) + '</span></div>' : '') +
        '</div>';
    } else {
      shot.innerHTML = '<p class="card-h">Shots</p><p class="note" style="margin:0">Not available for this match.</p>';
    }
    grid.appendChild(shot);
    view.appendChild(grid);

    /* player table */
    if (m.players && m.players.length) {
      var pc = el('div', 'card');
      pc.style.marginTop = '16px';
      var body = m.players.filter(function (p) { return p.shots || p.goals || p.assists || p.freekicks || p.corners; })
        .map(function (p) {
          return '<tr><td><span class="shirt">' + p.no + '</span><span class="pname">' + esc(p.name) + '</span></td>' +
            '<td>' + (p.goals || '·') + '</td><td>' + (p.assists || '·') + '</td><td>' + (p.shots || '·') + '</td>' +
            '<td>' + (p.onTarget || '·') + '</td><td>' + (p.offTarget || '·') + '</td><td>' + (p.blocked || '·') + '</td>' +
            '<td>' + esc(p.shotAcc) + '</td><td>' + (p.freekicks || '·') + '</td><td>' + (p.corners || '·') + '</td></tr>';
        }).join('');
      pc.innerHTML = '<p class="card-h">Player metrics <span class="right">' + esc(usName) + ' · attacking columns</span></p>' +
        '<div class="tbl-scroll"><table class="dt"><thead><tr><th>Player</th><th>Goals</th><th>Assists</th><th>Shots</th>' +
        '<th>On tgt</th><th>Off tgt</th><th>Blocked</th><th>Shot acc</th><th>Freekicks</th><th>Corners</th></tr></thead>' +
        '<tbody>' + body + '</tbody></table></div>' +
        (m.formation ? '<p class="note">Formation logged as ' + esc(m.formation) + '.</p>' : '');
      view.appendChild(pc);
    }

    fillBars(view);
  }

  /* ---------------------------------------------------------
     View: one match, the full analysis

     The same view the analyst uses, fed a published report instead of a live
     database. Everything it can do there it can do here — three views, both
     sides, the four categories, the maps and the exports — because it is the
     same file, not a second version of it.
     --------------------------------------------------------- */
  function matchHead(m) {
    var context = m.stage || m.competition || state.channel.stage || state.channel.competition || '';
    return head(
      esc(m.home.name) + ' ' + num(m.home.score) + ' — ' + num(m.away.score) + ' ' + esc(m.away.name),
      m.dateLabel + (context ? ' · ' + context : '') + ' · Match ID ' + m.id
    );
  }

  function matchTabs(m, on) {
    var wrap = el('div', 'mtabs');
    [['overview', '', 'Overview'], ['stats', '/stats', 'Analysis']].forEach(function (t) {
      var b = el('button', 'mtab' + (on === t[0] ? ' on' : ''), t[2]);
      b.type = 'button';
      b.addEventListener('click', function () {
        location.hash = '#/match/' + encodeURIComponent(m.slug || m.id) + t[1];
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function renderMatchStats(view, slug) {
    var m = state.matches.filter(function (x) { return String(x.slug || x.id) === slug; })[0];
    if (!m) { location.hash = '#/home'; return; }

    var back = el('button', 'back', '&larr; All matches');
    back.addEventListener('click', function () { location.hash = '#/home'; });
    view.appendChild(back);
    view.appendChild(matchHead(m));
    view.appendChild(matchTabs(m, 'stats'));

    if (!m.uuid) {
      view.appendChild(emptyState('Nothing to open',
        'The sample channel was read out of finished match reports rather than tagged here, ' +
        'so there is no analysis behind it.'));
      return;
    }

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
      view.appendChild(el('p', 'note',
        'Version ' + rep.version +
        (rep.eventCount != null ? ' · ' + rep.eventCount + ' events' : '') +
        (rep.publishedAt ? ' · submitted ' + String(rep.publishedAt).slice(0, 10) : '') +
        '. This is the analysis as it was signed off; it changes when a new one is submitted.'));
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
      '<p class="card-h">Team stats <span class="right">' + esc(state.channel.name) + '</span></p>' +
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
    view.appendChild(head('Players', 'Who put the numbers on the board'));

    var contributors = state.channel.contributors;
    if (!contributors || !contributors.length) {
      /* build one from whatever match player tables exist */
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
    return state.channels.filter(function (c) { return !c.seed; });
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
          (c.country ? ' · ' + esc(c.country) : '') + '</em></span>' +
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

    drawMembers();
    if (isAdmin) drawInvites();

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
          state.channels = (clubs || []).map(function (c) { return Object.assign({}, c, { seed: false }); });
          state.channels.push(state.seedChannel);
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
  function head(title, sub) {
    return el('div', 'view-head', '<h1>' + title + '</h1><span class="sub">' + esc(sub) + '</span>');
  }
  function kpi(label, value, delta) {
    return '<div class="kpi"><span class="k-l">' + esc(label) + '</span><span class="k-v">' + num(value) + '</span>' +
      (delta ? '<span class="k-d k-flat">' + esc(delta) + '</span>' : '') + '</div>';
  }
  function emptyState(title, body) {
    return el('div', 'state', '<b>' + esc(title) + '</b><p>' + esc(body) + '</p>');
  }
  /* The bars start at width:0 in CSS and every view rebuilds its DOM, so
     setting the final width is enough for the transition to run. Doing it
     straight (rather than through a double rAF) means a backgrounded tab —
     where rAF is paused — still ends up showing the right numbers. */
  function fillBars(scope) {
    scope.querySelectorAll('[data-w]').forEach(function (b) {
      b.style.width = b.getAttribute('data-w') + '%';
    });
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
