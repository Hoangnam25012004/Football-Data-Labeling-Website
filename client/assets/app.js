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

    ready.then(function (user) {
      state.user = user;
      if (!user) return [];
      return window.HNA.clubs();
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
    var h = location.hash.replace(/^#\/?/, '') || 'matches';
    var parts = h.split('/');
    document.querySelectorAll('.side a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === parts[0]);
    });
    var view = $('#view');
    view.innerHTML = '';
    if (parts[0] === 'match' && parts[1]) return renderMatch(view, decodeURIComponent(parts[1]));
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
      var b = el('button', 'mrow');
      b.type = 'button';
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
          '<span class="m-open"><svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M1 0 9 5 1 10Z"/></svg></span>' +
        '</span>';
      b.addEventListener('click', function () { location.hash = '#/match/' + encodeURIComponent(m.slug || m.id); });
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

    var context = m.stage || m.competition || state.channel.stage || state.channel.competition || '';
    view.appendChild(head(
      esc(m.home.name) + ' ' + num(m.home.score) + ' — ' + num(m.away.score) + ' ' + esc(m.away.name),
      m.dateLabel + (context ? ' · ' + context : '') + ' · Match ID ' + m.id
    ));

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
     View: data (campaign aggregates)
     --------------------------------------------------------- */
  function renderData(view) {
    view.appendChild(head('Data', 'Everything tagged in this channel, added up'));

    var ms = state.matches.filter(function (m) { return m.us; });
    if (!ms.length) {
      view.appendChild(emptyState('Nothing to add up yet',
        'Aggregates appear once there is at least one published match with tagged events.'));
      return;
    }

    var sum = function (k) {
      var t = 0, any = false;
      ms.forEach(function (m) { if (m.us[k] != null) { t += Number(m.us[k]); any = true; } });
      return any ? t : null;
    };
    var gf = sum('goals'), shots = sum('shots'), onT = sum('onTarget');
    var passes = sum('passes'), done = sum('passesDone');
    var ga = 0; ms.forEach(function (m) { if (m.them && m.them.goals != null) ga += m.them.goals; });

    var kpis = el('div', 'kpis');
    kpis.innerHTML =
      kpi('Matches', ms.length, 'in this channel') +
      kpi('Goals for', gf, 'across the campaign') +
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

    document.querySelectorAll('.side a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        location.hash = '#/' + a.getAttribute('data-view');
      });
    });

    window.addEventListener('hashchange', route);
    boot();
  });
})();
