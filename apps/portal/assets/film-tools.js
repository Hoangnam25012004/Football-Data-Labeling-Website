/* ============================================================================
   client/assets/film-tools.js — the performance analyst's toolkit over Film.

   The right-click menu inside full screen, the drawing layer, freeze-frame and
   frame stepping, clips and playlists, and the two exports. Design:
   docs/film-telestration-design.md.

   THIS FILE IS LOADED BY THE CLIENT CHANNEL AND NOWHERE ELSE. Q1 was answered
   B — the analyst's tools belong to the club's channel, and the tagging app's
   own Stats page comes out of this change with nothing added. Stats/stats-view.js
   knows this file only through four one-line calls that do nothing at all when
   nobody has registered, so a host that does not load it is a host where none of
   this exists.

   THREE THINGS IT NEVER DOES, and they are the point (§0.1 of the design):

     it never uploads.       A rendered clip goes from RAM to the analyst's own
                             disk and stops there. No R2 PUT, no Supabase
                             Storage, no temporary link. Storage cost: zero.
     it never writes video.  The only traffic to Cloudflare is the GET the video
                             player was making anyway.
     it never shows itself.  No clip open means no drawing layer in the DOM and
                             no query fired, so a player opening the channel sees
                             what they saw yesterday, to the pixel.

   Tags and playlists are the one thing that does leave this browser, and they
   are words about the video rather than the video: they go through the channel's
   data layer (HNA.film in assets/supa.js), and only for a signed-in member. Design
   of this layer of the toolkit: docs/design/film-analyst-toolkit-design.md.

   Coordinates are the VIDEO'S OWN PIXELS. Not the screen's, not the stage's:
   the stage letterboxes a 16:9 picture inside whatever box the layout gives it
   (in full screen, measurably, 1430x951 holding a 1430x804 picture), so a mark
   stored against the box slides off the grass the moment the window changes
   shape. Video pixels are the one frame of reference that is the same on the
   analyst's laptop, on the projector, and inside the exported file — which is
   also why the exports can reuse this renderer without a second coordinate
   system to drift out of step.
   ========================================================================== */
window.PTFilmTools = (function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var STORE_KEY = 'hna.film.tools.v1';

  /* What stats-view.js handed over on attach: the video, the boxes, the clock
     helpers and the few actions worth borrowing. Null whenever Film is not on
     screen — every entry point below checks it first. */
  var ctx = null;

  var layer = null;        // {svg, gDim, gShapes, gDraft, mask, w, h}
  var shapes = [];         // the drawing for the open match, in video pixels
  var draft = null;        // the shape being dragged out right now
  var mode = null;         // which drawing tool is armed, if any
  var menu = null;         // the context menu element, while it is open
  var panel = null;        // the clip drawer, while it is open
  var full = false;
  var hidden = false;      // H hides the whole layer without deleting it
  var dim = false;
  var zoom = null;         // {k, x, y} in video pixels
  var loopAB = null;       // {a, b}
  var mark = { in: null, out: null };
  var markKey = null;      // the match+half those marks were taken in
  var play = null;         // playlist playback: {list, i, clip}
  var fps = 25;            // measured on the way in; 25 until it is
  var seq = 0;
  var busy = false;        // a render is running — one at a time

  /* Time is the point of all of this: a mark belongs to the MOMENT it was drawn
     on, not to the match. Everything below exists to make that window visible,
     selectable and editable — see docs/film-telestration-time-design.md. */
  var selected = null;     // id of the shape being edited, if any
  var adjust = null;       // {id} — the spotlight being dragged / wheeled right now
  var ptr = null;          // last pointer position over the picture, in video pixels
  var strip = null;        // {el, lane, cur} — the timeline lane, while it is up
  var stripOn = true;      // Q4: up whenever the match has a drawing
  var anchor = null;       // the frame a drag was started on, latched at pointerdown
  var defaultDur = 4;      // Q2 → 4,0s, and remembered across shapes in a session

  /* The inspector, the clip editor, measuring and tags. All of it is null until
     the analyst asks for it, which is what keeps the channel view untouched. */
  var insp = null;         // {el, kind, ...}: the panel beside the picture
  var inspPos = null;      // {x, y}: where the analyst dragged it to, in the stage
  var collect = null;      // {id}: a link or an area still being clicked out
  var editor = null;       // {el, clip, sel, hist, x, ph}
  var edDragEnd = null;    // lets a drag be let go of if the room closes under it
  var hold = null;         // {timer}: the preview sitting on a freeze
  var fadeEl = null;       // the black sheet the preview fades with
  var previewRate = null;  // what playback was before an edit took it over
  var previewMuted = null;
  var editT = null;        // last clock the edit preview saw, to spot a freeze being crossed
  var exportTexts = null;  // the captions of the clip being rendered
  var cal = null;          // {t, H, L, W, pts}: the pitch, as of one frame
  var calDraft = null;     // the four clicks on their way to being a calibration
  var units = 'm';
  var lastMeasure = 'distance';
  var scope = null;        // {clubId, matchUuid, role, userId}: told by the host page
  var tagData = null;      // {tags, playlists, codes}, once asked for
  var tagLoad = null;
  var tagFail = null;      // why the last load did not work, said only when asked
  var panelTab = 'clips';
  var panelList = '';      // the playlist the tag tab is filtered to
  var resumeEditor = null; // the clip open when a redraw took the stage away

  var FADE = 0.25;         // Q3 → old drawings are upgraded to it as well
  var MIN_TAIL = 1.5;      // a shape is always visible for this long after release
  var ZMIN = 1, ZMAX = 6;  // wheel zoom range
  var RMIN = 0.02, RMAX = 0.60;   // spotlight radius, as a fraction of picture height

  var HOME = '#EEEEEE', AWAY = '#FFFF66', ACCENT = '#E0122B';

  /* ---------------------------------------------------------------
     small helpers
     --------------------------------------------------------------- */
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag), k;
    for (k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var id = function () { return 's' + (++seq) + '-' + Date.now().toString(36); };
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  /* Node.contains by hand, walking parentNode: the same answer in a browser and
     under the stub the tests drive this with. */
  function within(root, n) {
    while (n) { if (n === root) return true; n = n.parentNode; }
    return false;
  }

  /* mm:ss of the MATCH clock — the same reading the transport bar shows, so a
     clip's name and the bar under it cannot disagree about when it happened */
  function clock(t) { return ctx ? ctx.clock(ctx.matchTime(t)) : '00:00'; }

  /* ---------------------------------------------------------------
     Time and geometry, as plain arithmetic

     Everything below is a pure function of its arguments, on purpose: the
     screen, the dim mask, the PNG and the MP4 all go through these, so a tracked
     ring cannot sit in one place on screen and another in the file.
     --------------------------------------------------------------- */
  var MIN_SEG = 0.2;       // a clip segment shorter than this is a slip of the hand
  var FADE_S = 0.35;       // one side of a dip to black, in seconds of output
  var CAL_SPAN = 1;        // how far from its frame a calibration is still believed

  function lerpKeys(keys, t) {
    var n = keys.length, i, a, b, u;
    if (!n) return null;
    if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y };
    if (t >= keys[n - 1].t) return { x: keys[n - 1].x, y: keys[n - 1].y };
    for (i = 1; i < n; i++) {
      if (t <= keys[i].t) {
        a = keys[i - 1]; b = keys[i];
        u = (t - a.t) / ((b.t - a.t) || 1);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    return { x: keys[n - 1].x, y: keys[n - 1].y };
  }
  /* Same frame replaces, a new frame inserts in order. The tolerance is half a
     frame at 25 fps, so a second drag on the frame just dragged does not leave
     two keys a hair apart with a jerk between them. */
  function upsertKey(keys, t, p) {
    var i;
    for (i = 0; i < keys.length; i++) {
      if (Math.abs(keys[i].t - t) < 0.02) { keys[i].x = p.x; keys[i].y = p.y; return keys; }
      if (keys[i].t > t) { keys.splice(i, 0, { t: t, x: p.x, y: p.y }); return keys; }
    }
    keys.push({ t: t, x: p.x, y: p.y });
    return keys;
  }
  /* The shape as it stands at `now`. A shape with no keyframes comes back as
     itself, which is what keeps the common frame free of allocation. */
  function resolved(s, now) {
    var r;
    if (s.kind === 'spotlight' && s.keys && s.keys.length) {
      r = Object.assign({}, s); r.at = lerpKeys(s.keys, now); return r;
    }
    if (s.kind === 'link') {
      r = Object.assign({}, s);
      r.now = now;
      r.pts = (s.pts || []).map(function (p) {
        return p.keys && p.keys.length ? lerpKeys(p.keys, now) : { x: p.x, y: p.y };
      });
      return r;
    }
    return s;
  }
  function distAlive(s, now) { return !!(s.dist && s.H && Math.abs(now - s.calT) <= CAL_SPAN); }
  /* What, beyond `rev`, would make this shape's node out of date. Empty for
     anything that does not move on its own, so paint() leaves it alone. */
  function geoKey(r, now) {
    if (r.kind === 'spotlight' && r.keys && r.keys.length)
      return Math.round(r.at.x) + ',' + Math.round(r.at.y);
    if (r.kind === 'link')
      return (r.pts || []).map(function (p) { return Math.round(p.x) + ',' + Math.round(p.y); }).join(';')
           + (distAlive(r, now) ? '|d' : '');
    return '';
  }

  /* Four picture points to four pitch points. The classic 8x8 linear system,
     with the picture coordinates scaled down first: raw pixel products run to
     1e6 beside entries of 1, and elimination on that loses digits it needs. */
  function homography(src, dst) {
    var S = 1000, A = [], i, r, c, piv, m, row;
    for (i = 0; i < 4; i++) {
      var x = src[i].x / S, y = src[i].y / S, u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (c = 0; c < 8; c++) {
      piv = c;
      for (r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-9) return null;
      row = A[c]; A[c] = A[piv]; A[piv] = row;
      for (r = 0; r < 8; r++) {
        if (r === c) continue;
        m = A[r][c] / A[c][c];
        for (i = c; i < 9; i++) A[r][i] -= m * A[c][i];
      }
    }
    var h = [];
    for (i = 0; i < 8; i++) h.push(A[i][8] / A[i][i]);
    return [h[0] / S, h[1] / S, h[2], h[3] / S, h[4] / S, h[5], h[6] / S, h[7] / S, 1];
  }
  function applyH(H, p) {
    var w = H[6] * p.x + H[7] * p.y + H[8];
    if (Math.abs(w) < 1e-9) return null;
    return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
  }
  /* Any three of the four in a line and the system is either singular or, worse,
     solvable and meaningless. Asked of both sets, because the pitch points can
     be fine while the clicks are not. */
  function collinear(pts, eps) {
    var i, j, k, a, b, c, area;
    for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) for (k = j + 1; k < 4; k++) {
      a = pts[i]; b = pts[j]; c = pts[k];
      area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      if (area < eps) return true;
    }
    return false;
  }
  function polyArea(pts) {
    var s = 0, i, a, b;
    for (i = 0; i < pts.length; i++) {
      a = pts[i]; b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }
  /* The places a broadcast shot actually shows, in metres, with (0,0) at the far
     left corner: x runs along the pitch, y from the far touchline to the near one. */
  function pitchMarks(L, W) {
    var cy = W / 2, bh = 20.16, gh = 9.16, out = [
      ['Left corner, far', 0, 0], ['Left corner, near', 0, W],
      ['Right corner, far', L, 0], ['Right corner, near', L, W],
      ['Halfway line, far touchline', L / 2, 0], ['Halfway line, near touchline', L / 2, W],
      ['Centre spot', L / 2, cy]
    ];
    [['Left', 0, 1], ['Right', L, -1]].forEach(function (e) {
      var n = e[0], x0 = e[1], d = e[2];
      out.push(
        [n + ' penalty box, far front corner', x0 + d * 16.5, cy - bh],
        [n + ' penalty box, near front corner', x0 + d * 16.5, cy + bh],
        [n + ' penalty box, far goal-line corner', x0, cy - bh],
        [n + ' penalty box, near goal-line corner', x0, cy + bh],
        [n + ' 6-yard box, far front corner', x0 + d * 5.5, cy - gh],
        [n + ' 6-yard box, near front corner', x0 + d * 5.5, cy + gh],
        [n + ' penalty spot', x0 + d * 11, cy]
      );
    });
    return out;
  }
  function fmtLen(m, u) {
    return '≈ ' + (u === 'yd' ? (m * 1.09361).toFixed(1) + ' yd' : m.toFixed(1) + ' m');
  }
  function fmtArea(m2, u) {
    return '≈ ' + (u === 'yd' ? Math.round(m2 * 1.19599) + ' yd²' : Math.round(m2) + ' m²');
  }

  /* ---- the clip's edit list ----

     A clip with no `edit` is exactly what it always was: one window at one
     speed. These give it segments the first time somebody opens the editor, and
     nothing else in the file needs to know about the difference. */
  function newEdit(c) {
    return { segs: [{ id: id(), a: c.in, b: c.out, speed: 1, trans: 'cut' }],
             freezes: [], texts: [], mute: false };
  }
  function segAt(e, t) {
    for (var i = 0; i < e.segs.length; i++)
      if (t >= e.segs[i].a && t < e.segs[i].b) return e.segs[i];
    return null;
  }
  function splitAt(e, t) {
    var s = segAt(e, t);
    if (!s || t - s.a < MIN_SEG || s.b - t < MIN_SEG) return null;
    var n = { id: id(), a: t, b: s.b, speed: s.speed, trans: 'cut' };
    s.b = t;
    e.segs.splice(e.segs.indexOf(s) + 1, 0, n);
    return n;
  }
  /* A segment can be dragged only as far as its neighbour, and never to nothing.
     lo/hi are the half's own window: Film cannot play outside it. */
  function trimSeg(e, sid, side, t, lo, hi) {
    var i, s = null;
    for (i = 0; i < e.segs.length; i++) if (e.segs[i].id === sid) { s = e.segs[i]; break; }
    if (!s) return false;
    if (side === 'a') s.a = clamp(t, Math.max(lo, i ? e.segs[i - 1].b : lo), s.b - MIN_SEG);
    else s.b = clamp(t, s.a + MIN_SEG, Math.min(hi, i < e.segs.length - 1 ? e.segs[i + 1].a : hi));
    return true;
  }
  function dropSeg(e, sid) {
    if (e.segs.length < 2) return false;
    e.segs = e.segs.filter(function (s) { return s.id !== sid; });
    return true;
  }
  /* Keeps the clip's own in/out honest after any edit, and throws away a freeze
     whose frame has just been cut out of the film. */
  function syncClip(c) {
    var e = c.edit;
    c.in = e.segs[0].a;
    c.out = e.segs[e.segs.length - 1].b;
    e.freezes = e.freezes.filter(function (f) { return !!segAt(e, f.t); });
  }
  /* Where the picture dips to black, as a function of the source clock, so the
     preview and the file are the same fade. */
  function fadeAlpha(segs, t) {
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (t < s.a || t >= s.b) continue;
      var a = s.trans === 'fade' ? clamp(1 - (t - s.a) / s.speed / FADE_S, 0, 1) : 0;
      var n = segs[i + 1];
      var b = n && n.trans === 'fade' ? clamp(1 - (s.b - t) / s.speed / FADE_S, 0, 1) : 0;
      return Math.max(a, b);
    }
    return 0;
  }
  /* What one render will actually do: which stretches, how fast, where it holds,
     and how long the file comes out. Several marks on one moment are merged and
     the longest hold wins, or a busy frame would stop the film three times. */
  function planOf(a, b, edit, shapeList) {
    var segs = edit ? edit.segs : [{ a: a, b: b, speed: 1, trans: 'cut' }];
    var inside = function (t) {
      for (var i = 0; i < segs.length; i++) if (t >= segs[i].a && t <= segs[i].b) return true;
      return false;
    };
    var freezes = (shapeList || [])
      .filter(function (s) { return s.freeze > 0 && inside(s.t); })
      .map(function (s) { return { t: s.t, hold: s.freeze }; })
      .concat(((edit && edit.freezes) || []).filter(function (f) { return inside(f.t); })
        .map(function (f) { return { t: f.t, hold: f.hold }; }))
      .sort(function (x, y) { return x.t - y.t; })
      .reduce(function (acc, f) {
        var last = acc[acc.length - 1];
        if (last && Math.abs(last.t - f.t) < 0.25) last.hold = Math.max(last.hold, f.hold);
        else acc.push(f);
        return acc;
      }, []);
    var run = segs.reduce(function (n, s) { return n + (s.b - s.a) / s.speed; }, 0);
    var holdTotal = freezes.reduce(function (n, f) { return n + f.hold; }, 0);
    return { segs: segs, freezes: freezes, holdTotal: holdTotal, total: run + holdTotal,
             mute: !!(edit && edit.mute) };
  }

  /* The line icons of the toolkit, stroked in currentColor so a row turning red
     on hover takes its icon with it. */
  var ICONS = {
    spotlight: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    link: '<circle cx="5" cy="17" r="2.5"/><circle cx="12" cy="7" r="2.5"/><circle cx="19" cy="15" r="2.5"/><path d="M6.6 15 10.6 9M13.8 8.6l3.6 4.6"/>',
    defline: '<path d="M3 12h18"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><path d="M3 5h3M9 5h3M15 5h3M3 19h3M9 19h3M15 19h3"/>',
    draw: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    arrow: '<path d="M5 19 19 5M9 5h10v10"/>',
    curve: '<path d="M4 18C6 9 13 6 19 7M15 3.5l4 3.5-3.5 4"/>',
    run: '<path d="M4 20l2-2M8 16l2-2M12 12l2-2"/><path d="M10 6h8v8"/>',
    freehand: '<path d="M3 17c3-6 5 2 8-4s4 3 6-1 3-2 4-1"/>',
    zone: '<path d="M4 7l8-3 8 4-2 11-12 1Z"/>',
    text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    marker: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    measure: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    freeze: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
    split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    markin: '<path d="M10 4H6v16h4"/><path d="M13 12h7M17 9l3 3-3 3"/>',
    markout: '<path d="M14 4h4v16h-4"/><path d="M4 12h7M8 9l3 3-3 3"/>',
    clip: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
    speed: '<path d="m12 14 4-4"/><path d="M3.3 19a9 9 0 1 1 17.4 0"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    playlist: '<path d="M3 6h12M3 12h12M3 18h8M18 15v6M15 18h6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    chain: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.3 3.4M6.6 6.6C4.3 8 2.6 10.3 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/>',
    layers: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="12" height="4" rx="1"/><rect x="3" y="16" width="15" height="4" rx="1"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    stepback: '<path d="M18 5 9 12l9 7Z"/><path d="M6 5v14"/>',
    stepfwd: '<path d="M6 5l9 7-9 7Z"/><path d="M18 5v14"/>',
    loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    transition: '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/><path d="M9 12h6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    dim: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/>',
    shape: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="17" cy="19" r="2"/><circle cx="6" cy="17" r="2"/><path d="M7 6h10M18.5 8l-1 9M15 19H8M5.5 15 5 8"/>',
    play: '<path d="M7 4v16l13-8Z" fill="currentColor"/>',
    check: '<path d="m5 12 5 5 9-10"/>'
  };
  function iconEl(name, cls) {
    var n = el('span', 'fmt-ic' + (cls ? ' ' + cls : ''));
    n.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return n;
  }

  /* ---------------------------------------------------------------
     Where the picture actually is

     object-fit:contain centres the frame inside the stage and leaves black
     bars on two of the four sides. Everything drawn has to sit on the PICTURE,
     so this is measured rather than assumed — and re-measured on every resize,
     every change of half and every trip in or out of full screen.
     --------------------------------------------------------------- */
  function pictureRect() {
    var v = ctx && ctx.video;
    if (!v || !v.videoWidth) return null;
    var b = v.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    var ar = v.videoWidth / v.videoHeight, boxAr = b.width / b.height;
    var w = ar > boxAr ? b.width : b.height * ar;
    var h = ar > boxAr ? b.width / ar : b.height;
    return { x: b.x + (b.width - w) / 2, y: b.y + (b.height - h) / 2, w: w, h: h };
  }

  /* client pixels -> video pixels. Returns null outside the picture, which is
     how a click on the black bars is refused rather than silently snapped. */
  function toVideo(clientX, clientY) {
    var r = pictureRect(); if (!r) return null;
    var k = ctx.video.videoWidth / r.w;
    var x = (clientX - r.x) * k, y = (clientY - r.y) * k;
    if (x < 0 || y < 0 || x > ctx.video.videoWidth || y > ctx.video.videoHeight) return null;
    return { x: x, y: y };
  }

  /* ---------------------------------------------------------------
     The drawing layer

     One SVG over the picture, viewBox in video pixels. Created only when there
     is something to draw or a tool is armed — a channel member who never opens
     a clip never gets this node at all.
     --------------------------------------------------------------- */
  function ensureLayer() {
    if (layer || !ctx || !ctx.stage) return layer;
    var v = ctx.video;
    var w = v.videoWidth || 1920, h = v.videoHeight || 1080;
    var svg = svgEl('svg', {
      'class': 'fmt-layer', viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'none'
    });
    var gDim = svgEl('g', { 'class': 'fmt-dim' });
    var gShapes = svgEl('g', { 'class': 'fmt-shapes' });
    var gDraft = svgEl('g', { 'class': 'fmt-draft' });
    svg.appendChild(gDim); svg.appendChild(gShapes); svg.appendChild(gDraft);
    ctx.stage.appendChild(svg);
    // nodes: id -> <g>, so a frame that changes nothing touches no DOM at all
    layer = { svg: svg, gDim: gDim, gShapes: gShapes, gDraft: gDraft, w: w, h: h,
              nodes: {}, dimKey: null };
    placeLayer();
    return layer;
  }
  function dropLayer() {
    if (layer && layer.svg.parentNode) layer.svg.parentNode.removeChild(layer.svg);
    layer = null;
  }
  /* The SVG is positioned absolutely over the picture, in the stage's own
     coordinates — so it survives the stage being resized by full screen without
     any of the shapes moving relative to the grass. */
  function placeLayer() {
    if (!layer || !ctx) return;
    var r = pictureRect(); if (!r) return;
    var s = ctx.stage.getBoundingClientRect();
    var st = layer.svg.style;
    st.left = (r.x - s.x) + 'px'; st.top = (r.y - s.y) + 'px';
    st.width = r.w + 'px'; st.height = r.h + 'px';
    // the video may have reported its size only after the layer was built
    var v = ctx.video;
    if (v.videoWidth && (v.videoWidth !== layer.w || v.videoHeight !== layer.h)) {
      layer.w = v.videoWidth; layer.h = v.videoHeight;
      layer.svg.setAttribute('viewBox', '0 0 ' + layer.w + ' ' + layer.h);
    }
    applyZoom();
  }

  /* Zoom is one transform on the SVG and one on the video, with the same origin,
     so the drawing and the grass magnify together. Anything else and a spotlight
     drifts off the player it was put on. */
  /* TWO ORIGINS, NOT ONE — and that is the whole point of this function.

     The <video> element is the STAGE-sized box; the picture is letterboxed
     inside it (measured: a 1430x951 box holding a 1430x804 picture, 73.5px of
     black above and below). The SVG, by contrast, is placed by placeLayer()
     to be EXACTLY the picture. So a percentage worked out against the picture
     is right for the SVG and wrong for the video, on whichever axis is boxed.

     Arithmetic, for a mark at video-pixel y=270 of a 1080-tall frame:
        what a single origin gives : 270/1080 = 25% x 951px = 237.75px
        where y=270 actually is    : 73.5 + (270/1080) x 804 = 274.50px
     — 36.75px apart, so the grass and the drawing would magnify about two
     different points, which is exactly the drift the file warns about above. */
  function applyZoom() {
    if (!ctx) return;
    var t = zoom ? 'scale(' + zoom.k + ')' : '';
    var v = ctx.video;
    v.style.transform = t;
    v.style.transformOrigin = zoom ? originOnElement(zoom.x, zoom.y) : '50% 50%';
    if (layer) {
      layer.svg.style.transform = t;
      layer.svg.style.transformOrigin = zoom
        ? (zoom.x / layer.w * 100) + '% ' + (zoom.y / layer.h * 100) + '%'
        : '50% 50%';
    }
  }

  /* The zoom origin in the VIDEO ELEMENT's own box, as a percentage pair.

     offsetWidth/offsetHeight, not getBoundingClientRect(): the rect is the box
     AFTER this very transform, so reading it here to work out the transform's
     own origin is a loop that feeds on itself. offsetWidth is layout, and
     layout does not move when something is scaled. */
  function originOnElement(px, py) {
    var v = ctx.video, ew = v.offsetWidth, eh = v.offsetHeight;
    if (!ew || !eh || !v.videoWidth) return '50% 50%';
    var ar = v.videoWidth / v.videoHeight, boxAr = ew / eh;
    var pw = ar > boxAr ? ew : eh * ar;
    var ph = ar > boxAr ? ew / ar : eh;
    var ox = (ew - pw) / 2 + px / v.videoWidth * pw;
    var oy = (eh - ph) / 2 + py / v.videoHeight * ph;
    return (ox / ew * 100) + '% ' + (oy / eh * 100) + '%';
  }

  /* One wheel notch. Multiplicative, so it feels the same at 1x and at 5x. */
  function zoomBy(f, p) {
    if (!ctx || !ctx.video.videoWidth) return;
    // magnifying the grass is about the VIDEO; a drawing layer need not exist
    var W = layer ? layer.w : ctx.video.videoWidth;
    var H = layer ? layer.h : ctx.video.videoHeight;
    var k = clamp((zoom ? zoom.k : 1) * f, ZMIN, ZMAX);
    if (k <= 1.01) zoom = null;          // back to life size: take the transform OFF
    else zoom = { k: k,
                  x: p ? p.x : (zoom ? zoom.x : W / 2),
                  y: p ? p.y : (zoom ? zoom.y : H / 2) };
    applyZoom();
    toast(zoom ? 'Zoom ' + zoom.k.toFixed(1) + '×' : 'Full size');
  }

  /* ---------------------------------------------------------------
     Rendering a shape

     One function, used by the screen and by both exports — the export
     rasterises this same SVG rather than re-drawing the shapes with a second
     set of code that would drift out of step with this one.
     --------------------------------------------------------------- */
  /* ---- the new kinds, drawn. Same rule as the rest of shapeNode: everything is
     in video pixels and nothing here touches the layer, so the export can call
     it for a frame the screen is not on. ---- */
  function hOf() { return layer ? layer.h : ((ctx && ctx.video && ctx.video.videoHeight) || 1080); }
  function wOf() { return layer ? layer.w : ((ctx && ctx.video && ctx.video.videoWidth) || 1920); }

  /* A label on a dark plate: readable on grass and on stands alike. The width is
     estimated from the character count, because a detached node cannot be
     measured and the export renders nodes that were never on screen. */
  function plateNode(x, y, text, fg, bg) {
    var fs = Math.round(hOf() * 0.02), w = text.length * fs * 0.62 + fs, h = fs * 1.6;
    var g = svgEl('g', { 'class': 'fmt-plate' });
    g.appendChild(svgEl('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h,
      rx: fs * 0.25, fill: bg || '#000', 'fill-opacity': bg ? 1 : 0.74 }));
    var t = svgEl('text', { x: x, y: y + fs * 0.36, fill: fg || '#fff', 'font-size': fs,
      'font-weight': 700, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle' });
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  function spotLook(g, s, col, wd) {
    var x = s.at.x, y = s.at.y, r = s.r, look = s.look;
    if (look === 'beam' || look === 'both') {
      var gid = 'fmtb' + String(s.id).replace(/[^\w-]/g, '');
      var defs = svgEl('defs', {});
      var lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.appendChild(svgEl('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }));
      lg.appendChild(svgEl('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0.32 }));
      defs.appendChild(lg);
      g.appendChild(defs);
      g.appendChild(svgEl('path', {
        d: 'M' + (x - r * 0.5) + ' ' + (y - r * 5) + 'L' + (x + r * 0.5) + ' ' + (y - r * 5) +
           'L' + (x + r * 0.9) + ' ' + y + 'L' + (x - r * 0.9) + ' ' + y + 'Z',
        fill: 'url(#' + gid + ')'
      }));
    }
    if (look === 'ring' || look === 'both') {
      g.appendChild(svgEl('ellipse', { cx: x, cy: y, rx: r * 1.3, ry: r * 0.44, fill: 'none',
        stroke: col, 'stroke-opacity': 0.55, 'stroke-width': wd * 0.5,
        'stroke-dasharray': (wd * 1.4) + ' ' + (wd * 1.4) }));
      g.appendChild(svgEl('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.34,
        fill: col, 'fill-opacity': 0.24, stroke: col, 'stroke-width': wd }));
    }
    if (look === 'head') {
      var d = r * 0.5, top = y - r * 5;
      g.appendChild(svgEl('path', {
        d: 'M' + (x - d) + ' ' + (top - d * 1.5) + 'L' + x + ' ' + top +
           'L' + (x + d) + ' ' + (top - d * 1.5) + 'Z',
        fill: col, stroke: '#000', 'stroke-width': 2
      }));
    }
    if (s.label && s.showLabel !== false)
      g.appendChild(plateNode(x, y - r * (look === 'head' ? 6.6 : 5.4), s.label, '#fff', col));
  }

  function linkNode(g, s, col, wd) {
    var pts = s.pts || [], n = pts.length, i, dash = null, d = '';
    if (!n) return;
    if (s.lineStyle === 'dashed') dash = (wd * 2.6) + ' ' + (wd * 2);
    if (s.sub === 'shape' && n > 2) {
      for (i = 0; i < n; i++) d += (i ? 'L' : 'M') + pts[i].x + ' ' + pts[i].y;
      g.appendChild(svgEl('path', { d: d + 'Z', fill: col, 'fill-opacity': 0.16, stroke: col,
        'stroke-width': wd, 'stroke-linejoin': 'round', 'stroke-dasharray': dash }));
    } else if (s.sub === 'line' && n > 1) {
      /* A line through the first and the last player, run out to the edges of the
         picture: the height of a defensive line is the point, and a line that
         stopped at the two full-backs would not show it against the attackers. */
      var a = pts[0], b = pts[n - 1], dx = b.x - a.x, dy = b.y - a.y, W = wOf(), x0, y0, x1, y1;
      if (Math.abs(dx) >= 1) {
        x0 = 0; y0 = a.y - dy / dx * a.x; x1 = W; y1 = a.y + dy / dx * (W - a.x);
      } else { x0 = x1 = a.x; y0 = 0; y1 = hOf(); }
      g.appendChild(svgEl('path', { d: 'M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1, fill: 'none',
        stroke: col, 'stroke-width': wd, 'stroke-dasharray': dash }));
    } else if (n > 1) {
      for (i = 0; i < n; i++) d += (i ? 'L' : 'M') + pts[i].x + ' ' + pts[i].y;
      g.appendChild(svgEl('path', { d: d, fill: 'none', stroke: col, 'stroke-width': wd,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': dash }));
      if (s.lineStyle === 'arrows') {
        for (i = 1; i < n; i++) {
          var ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
          var L = Math.sqrt(ax * ax + ay * ay) || 1, hx = ax / L, hy = ay / L, hl = wd * 3.4, hw = wd * 1.9;
          g.appendChild(svgEl('path', {
            d: 'M' + pts[i].x + ' ' + pts[i].y +
               'L' + (pts[i].x - hx * hl - hy * hw) + ' ' + (pts[i].y - hy * hl + hx * hw) +
               'L' + (pts[i].x - hx * hl + hy * hw) + ' ' + (pts[i].y - hy * hl - hx * hw) + 'Z',
            fill: col }));
        }
      }
    }
    var rx = hOf() * 0.022;
    pts.forEach(function (p) {
      g.appendChild(svgEl('ellipse', { cx: p.x, cy: p.y, rx: rx, ry: rx * 0.36,
        fill: col, 'fill-opacity': 0.28, stroke: col, 'stroke-width': wd * 0.6 }));
    });
    if (n > 1 && s.now != null && distAlive(s, s.now)) {
      var m = pts.map(function (p) { return applyH(s.H, p); });
      if (m.every(Boolean)) {
        var last = s.sub === 'shape' && n > 2 ? n : n - 1;
        for (i = 0; i < last; i++) {
          var j = (i + 1) % n;
          var dm = Math.sqrt(Math.pow(m[i].x - m[j].x, 2) + Math.pow(m[i].y - m[j].y, 2));
          g.appendChild(plateNode((pts[i].x + pts[j].x) / 2, (pts[i].y + pts[j].y) / 2 - hOf() * 0.018,
            fmtLen(dm, s.units)));
        }
        if (n > 2) {
          var xs = m.map(function (q) { return q.x; }), ys = m.map(function (q) { return q.y; });
          var cx = pts.reduce(function (t, p) { return t + p.x; }, 0) / n;
          var cy = pts.reduce(function (t, p) { return t + p.y; }, 0) / n;
          g.appendChild(plateNode(cx, cy, 'Width ' + fmtLen(Math.max.apply(null, ys) - Math.min.apply(null, ys), s.units)
            + ' · Depth ' + fmtLen(Math.max.apply(null, xs) - Math.min.apply(null, xs), s.units), col === '#000' ? '#fff' : col));
        }
      }
    }
  }

  function measureNode(g, s, col, wd) {
    var i, d = '';
    if (s.sub === 'area') {
      var pts = s.pts || [];
      if (!pts.length) return;
      for (i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + pts[i].x + ' ' + pts[i].y;
      g.appendChild(svgEl('path', { d: d + (pts.length > 2 ? 'Z' : ''), fill: col, 'fill-opacity': 0.18,
        stroke: col, 'stroke-width': wd * 0.7, 'stroke-linejoin': 'round' }));
      pts.forEach(function (p) {
        g.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: wd * 1.1, fill: col }));
      });
      if (s.metres != null && pts.length > 2) {
        var cx = pts.reduce(function (t, p) { return t + p.x; }, 0) / pts.length;
        var cy = pts.reduce(function (t, p) { return t + p.y; }, 0) / pts.length;
        g.appendChild(plateNode(cx, cy, fmtArea(s.metres, s.units)));
      }
      return;
    }
    var a = s.from, b = s.to;
    g.appendChild(svgEl('path', { d: 'M' + a.x + ' ' + a.y + 'L' + b.x + ' ' + b.y,
      fill: 'none', stroke: col, 'stroke-width': wd * 0.8, 'stroke-linecap': 'round' }));
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / L * wd * 2.2, ny = dx / L * wd * 2.2;
    [a, b].forEach(function (p) {
      g.appendChild(svgEl('path', { d: 'M' + (p.x - nx) + ' ' + (p.y - ny) + 'L' + (p.x + nx) + ' ' + (p.y + ny),
        fill: 'none', stroke: col, 'stroke-width': wd * 0.8 }));
    });
    if (s.metres != null) {
      var tag = { width: 'Width ', depth: 'Depth ' }[s.sub] || '';
      g.appendChild(plateNode((a.x + b.x) / 2, (a.y + b.y) / 2 - hOf() * 0.022, tag + fmtLen(s.metres, s.units)));
    }
  }

  /* What a text overlay of the clip being edited looks like to the renderer: an
     ordinary text shape. `extra` keeps it out of hit-testing, the lane and the
     drawing list, which all belong to the match's drawings and not to one clip. */
  function textShape(x) {
    var h = hOf(), y = { top: 0.14, mid: 0.52, low: 0.84 }[x.pos || 'low'] * h;
    return { id: 'tx-' + x.id, extra: true, kind: 'text', at: { x: wOf() / 2, y: y },
             anchor: 'middle', text: x.text, size: Math.round(h * 0.052),
             style: { color: x.color || '#FFFFFF' }, in: x.a, out: x.b, t: x.a,
             life: 'moment', fade: 0.12, rev: x.rev || 0 };
  }
  function activeTexts() {
    if (exportTexts) return exportTexts;
    if (editor) return editor.clip.edit.texts;
    if (play && play.clip && play.clip.edit) return play.clip.edit.texts;
    return null;
  }

  function shapeNode(s, phase) {
    var st = s.style || {}, col = st.color || ACCENT, wd = st.width || 6;
    var g = svgEl('g', { 'class': 'fmt-s fmt-' + s.kind });
    var i, p;
    if (s.kind === 'spotlight' && s.look && s.look !== 'circle') {
      spotLook(g, s, col, wd);
    } else if (s.kind === 'spotlight') {
      var rr = s.r * (st.pulse ? (1 + 0.06 * Math.sin(phase * Math.PI * 2)) : 1);
      g.appendChild(svgEl('circle', {
        cx: s.at.x, cy: s.at.y, r: rr, fill: 'none',
        stroke: col, 'stroke-width': wd
      }));
      if (s.label && s.showLabel !== false)
        g.appendChild(plateNode(s.at.x, s.at.y - s.r - hOf() * 0.024, s.label, '#fff', col));
    } else if (s.kind === 'link') {
      linkNode(g, s, col, wd);
    } else if (s.kind === 'measure') {
      measureNode(g, s, col, wd);
    } else if (s.kind === 'marker') {
      // a chevron UNDER the player: marks him without covering him
      var d = s.r || 26;
      g.appendChild(svgEl('path', {
        d: 'M' + (s.at.x - d) + ' ' + (s.at.y - d * 1.5) + 'L' + s.at.x + ' ' + s.at.y +
           'L' + (s.at.x + d) + ' ' + (s.at.y - d * 1.5) + 'Z',
        fill: col, stroke: '#000', 'stroke-width': 2
      }));
    } else if (s.kind === 'arrow') {
      var a = s.from, b = s.to, c = s.curve;
      var path = c ? 'M' + a.x + ' ' + a.y + 'Q' + c.x + ' ' + c.y + ' ' + b.x + ' ' + b.y
                   : 'M' + a.x + ' ' + a.y + 'L' + b.x + ' ' + b.y;
      g.appendChild(svgEl('path', {
        d: path, fill: 'none', stroke: col, 'stroke-width': wd,
        'stroke-linecap': 'round',
        'stroke-dasharray': s.dash ? (wd * 2.6) + ' ' + (wd * 2) : null
      }));
      // the head, aimed along the last leg of the path
      var ax = c ? b.x - c.x : b.x - a.x, ay = c ? b.y - c.y : b.y - a.y;
      var L = Math.sqrt(ax * ax + ay * ay) || 1, hx = ax / L, hy = ay / L;
      var hl = wd * 3.4, hw = wd * 1.9;
      g.appendChild(svgEl('path', {
        d: 'M' + b.x + ' ' + b.y +
           'L' + (b.x - hx * hl - hy * hw) + ' ' + (b.y - hy * hl + hx * hw) +
           'L' + (b.x - hx * hl + hy * hw) + ' ' + (b.y - hy * hl - hx * hw) + 'Z',
        fill: col
      }));
    } else if (s.kind === 'pen') {
      p = ''; for (i = 0; i < s.pts.length; i++) p += (i ? 'L' : 'M') + s.pts[i][0] + ' ' + s.pts[i][1];
      g.appendChild(svgEl('path', {
        d: p, fill: 'none', stroke: col, 'stroke-width': wd,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
    } else if (s.kind === 'zone') {
      g.appendChild(svgEl('rect', {
        x: Math.min(s.from.x, s.to.x), y: Math.min(s.from.y, s.to.y),
        width: Math.abs(s.to.x - s.from.x), height: Math.abs(s.to.y - s.from.y),
        fill: col, 'fill-opacity': 0.26, stroke: col, 'stroke-width': wd * 0.6
      }));
    } else if (s.kind === 'text') {
      var fs = s.size || Math.round(layer ? layer.h * 0.045 : 40);
      var t = svgEl('text', {
        x: s.at.x, y: s.at.y, fill: col, 'font-size': fs,
        'font-weight': 800, 'font-family': 'system-ui, sans-serif',
        stroke: '#000', 'stroke-width': fs * 0.09, 'paint-order': 'stroke',
        'text-anchor': s.anchor || null
      });
      t.textContent = s.text || '';
      g.appendChild(t);
    }
    return g;
  }

  /* ---------------------------------------------------------------
     The window: which shapes are alive at `now`

     THIS is the answer to "the arrow I drew at 3:14 must exist at 3:14 and
     nowhere else". A shape carries the moment it was drawn on (`t`) and the
     window it lives in (`in`/`out`); `pinned` is the one deliberate way to opt
     back out of time, and it has to be chosen.
     --------------------------------------------------------------- */
  function liveAt(now) {
    if (hidden) return [];
    var within = function (s) {
      if (s.life === 'pinned') return true;
      var f = s.fade || 0;
      return s.in - f <= now && now <= s.out + f;   // widened for the fade
    };
    var out = shapes.filter(within), tx = activeTexts();
    if (tx && tx.length) out = out.concat(tx.map(textShape).filter(within));
    return out;
  }

  /* Opacity as a FUNCTION OF TIME, never a CSS transition: the export
     rasterises this SVG through an <img>, where no transition ever runs, so a
     transition would fade on screen and pop in the file. */
  function alpha(s, now) {
    if (s.life === 'pinned') return 1;
    var f = s.fade || 0;
    if (!f) return 1;
    if (now < s.in) return clamp((now - (s.in - f)) / f, 0, 1);
    if (now > s.out) return clamp(1 - (now - s.out) / f, 0, 1);
    return 1;
  }
  function pulse(n, s, phase) {
    var c = n.firstChild;
    if (c) c.setAttribute('r', s.r * (1 + 0.06 * Math.sin(phase * Math.PI * 2)));
  }

  /* The dark sheet with a hole at every live spotlight, as loose nodes. Built
     the same way for the screen and for the export — only the destination and
     the mask id differ. */
  function dimNodes(live, tag) {
    if (!dim || hidden) return [];
    var w = layer ? layer.w : ctx.video.videoWidth;
    var h = layer ? layer.h : ctx.video.videoHeight;
    var mid = 'fmtmask' + tag;
    var m = svgEl('mask', { id: mid });
    m.appendChild(svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: '#fff' }));
    live.forEach(function (s) {
      if (s.kind !== 'spotlight') return;
      // a ring sits at the feet, so its hole has to take in the whole player
      if (s.look && s.look !== 'circle')
        m.appendChild(svgEl('ellipse', { cx: s.at.x, cy: s.at.y - s.r * 2.3,
                                         rx: s.r * 1.5, ry: s.r * 3.2, fill: '#000' }));
      else m.appendChild(svgEl('circle', { cx: s.at.x, cy: s.at.y, r: s.r, fill: '#000' }));
    });
    return [m, svgEl('rect', {
      x: 0, y: 0, width: w, height: h,
      fill: '#000', 'fill-opacity': 0.62, mask: 'url(#' + mid + ')'
    })];
  }

  /* The holes have to follow a spotlight that is being dragged or wheeled, so
     the key is position and radius — not the id alone. */
  function dimKeyOf(live) {
    if (!dim || hidden) return 'off';
    return 'on|' + live.filter(function (s) { return s.kind === 'spotlight'; })
      .map(function (s) { return s.id + ':' + s.at.x + ':' + s.at.y + ':' + s.r + ':' + (s.look || ''); }).join(',');
  }
  function paintDim(live) {
    var key = dimKeyOf(live);
    if (key === layer.dimKey) return;          // nothing moved — touch no DOM
    layer.dimKey = key;
    empty(layer.gDim);
    dimNodes(live, (layer.maskN = (layer.maskN || 0) + 1))
      .forEach(function (n) { layer.gDim.appendChild(n); });
  }

  /* One frame, RECONCILED rather than rebuilt.

     The old version wiped both groups and re-created every node, sixty times a
     second — measured: a fresh <mask> id on each of five consecutive frames.
     That is wasteful on its own, and it makes a fade impossible to see and a
     selection outline flicker. Now a node is built only when the shape it
     belongs to actually changed (`rev`), and the per-frame work is one opacity
     attribute per live shape. */
  function paint(now, phase) {
    if (!layer) return;
    var live = liveAt(now), seen = {};
    live.forEach(function (s) {
      seen[s.id] = 1;
      var n = layer.nodes[s.id], r = resolved(s, now), gk = geoKey(r, now);
      if (!n || n.__rev !== s.rev || n.__gk !== gk) {
        if (n && n.parentNode) layer.gShapes.removeChild(n);
        n = shapeNode(r, phase); n.__rev = s.rev; n.__gk = gk;
        layer.nodes[s.id] = n; layer.gShapes.appendChild(n);
      }
      n.setAttribute('opacity', alpha(s, now));
      if (s.kind === 'spotlight' && s.style && s.style.pulse) pulse(n, s, phase);
      n.classList.toggle('fmt-sel', s.id === selected);
    });
    Object.keys(layer.nodes).forEach(function (k) {
      if (seen[k]) return;
      var n = layer.nodes[k];
      if (n.parentNode) layer.gShapes.removeChild(n);
      delete layer.nodes[k];
    });
    // z-order is the order shapes were drawn in, which reconciliation would
    // otherwise scramble. Re-stack only when the live SET changes, not per frame.
    var ord = live.map(function (s) { return s.id; }).join(',');
    if (ord !== layer.ord) {
      layer.ord = ord;
      live.forEach(function (s) {
        var n = layer.nodes[s.id];
        // detach before re-attaching: appendChild on a node that is already a
        // child MOVES it, but only in a real DOM — being explicit keeps this
        // honest under the stub the tests drive it with, and costs nothing
        if (n.parentNode) n.parentNode.removeChild(n);
        layer.gShapes.appendChild(n);
      });
    }
    paintDim(live.map(function (s) { return resolved(s, now); }));
  }

  /* ---------------------------------------------------------------
     Persistence — localStorage, per Q2 answered A.

     Tier 1 wants to be usable the day it ships, and the JSON here is exactly
     the shape the Supabase columns will take at tier 2, so moving it later is a
     transport change and not a rewrite. Nothing here is ever sent anywhere.
     --------------------------------------------------------------- */
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* full or private mode */ }
  }
  function matchKey() {
    return (ctx && ctx.meta && (ctx.meta.matchId || ctx.meta.matchCode)) || 'unknown';
  }
  function persist() {
    var s = loadStore(); s.byMatch = s.byMatch || {};
    var was = s.byMatch[matchKey()] || {};
    s.byMatch[matchKey()] = { v: 2, shapes: shapes, clips: was.clips || [], cal: was.cal };
    saveStore(s);
  }
  function clips() {
    var s = loadStore();
    return ((s.byMatch || {})[matchKey()] || {}).clips || [];
  }
  function setClips(list) {
    var s = loadStore(); s.byMatch = s.byMatch || {};
    var m = s.byMatch[matchKey()] = s.byMatch[matchKey()] || {};
    m.v = 2; m.clips = list; m.shapes = shapes;
    saveStore(s);
  }
  /* A v1 record has in/out and nothing else. Fill in the rest rather than
     migrate: the key does not change, so nobody's drawing is thrown away, and a
     record written by an older tab is still readable by this one.

     The WINDOW is left alone to the millisecond. The one visible difference is
     the fade, which old shapes are given deliberately (Q3) so a drawing made
     yesterday and one made today do not look like two different tools. */
  function upgrade(s) {
    if (s.t    == null) s.t    = s.in;      // the anchor was the start, back then
    if (s.life == null) s.life = 'moment';
    if (s.fade == null) s.fade = FADE;
    if (s.rev  == null) s.rev  = 0;
    return s;
  }
  function restore() {
    var m = (loadStore().byMatch || {})[matchKey()];
    shapes = ((m && m.shapes) || []).map(upgrade);
    cal = (m && m.cal) || null;
    selected = null; adjust = null;
    if (shapes.length) { ensureLayer(); paint(ctx.video.currentTime, 0); }
  }

  /* ---------------------------------------------------------------
     Adding shapes
     --------------------------------------------------------------- */
  /* `at` is the moment the shape belongs to. The menu passes the frame the
     analyst right-clicked on, which is NOT the same thing as "now" any more —
     the video no longer stops when the menu opens, so by the time an item is
     chosen the clock has moved on and the drawing would land on a frame where
     the player has run off. */
  function addShape(s, at) {
    ensureLayer();
    s.id = id();
    if (at == null) at = ctx.video.currentTime;
    if (s.t == null) s.t = at;
    if (s.in == null) { s.in = s.t; s.out = s.t + defaultDur; }
    if (s.life == null) s.life = 'moment';
    if (s.fade == null) s.fade = FADE;
    s.rev = 0;
    shapes.push(s); persist();
    paint(ctx.video.currentTime, 0);
    renderStrip();
    return s;
  }

  /* Committing a DRAGGED shape, where the anchor was latched at pointerdown.

     MIN_TAIL is the guard that stops the measured bug: with the video running,
     a pen stroke from t=100 to t=106 used to be stored as 100..104 and was
     therefore already dead when the analyst let go — they drew a line and
     nothing appeared. The window may never end before the release. */
  function commit(d, at) {
    d.t = at;
    d.life = d.life || 'moment';
    d.in = at;
    d.out = at + defaultDur;
    var rel = ctx.video.currentTime;
    if (d.out < rel + MIN_TAIL) d.out = rel + MIN_TAIL;
    return addShape(d, at);
  }

  function shapeById(sid) {
    for (var i = 0; i < shapes.length; i++) if (shapes[i].id === sid) return shapes[i];
    return null;
  }
  /* Anything that edits a shape goes through here: bumping rev is what tells
     paint() to rebuild that one node and leave the rest alone.

     `quiet` is for the two paths that fire at pointer speed — dragging a
     spotlight and wheeling its radius. Writing localStorage on every mousemove
     would be a synchronous JSON round-trip per frame, so those repaint at once
     and save on a trailing timer instead. */
  function touch(s, quiet) {
    if (!s) return;
    s.rev = (s.rev || 0) + 1;
    if (layer) paint(ctx.video.currentTime, 0);
    if (quiet) return;
    persist();
    renderStrip();
  }
  var saveT = 0;
  function persistSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { persist(); renderStrip(); }, 220);
  }
  function removeShape(sid) {
    var i;
    for (i = 0; i < shapes.length; i++) if (shapes[i].id === sid) break;
    if (i >= shapes.length) return;
    shapes.splice(i, 1);
    if (selected === sid) selected = null;
    if (adjust && adjust.id === sid) { adjust = null; armCursor(); }
    if (collect && collect.id === sid) { collect = null; armCursor(); }
    persist();
    if (layer) paint(ctx.video.currentTime, 0);
    renderStrip();
    shapeGone();
  }
  /* The panel showing a drawing that no longer exists goes with it. */
  function shapeGone() {
    if (!insp || insp.kind !== 'shape' || shapeById(insp.id)) return;
    closeInsp();
    if (editor) openInsp('clip', {});
  }
  function undo() {
    if (!shapes.length) return;
    var gone = shapes.pop();
    if (selected === gone.id) selected = null;
    if (adjust && adjust.id === gone.id) { adjust = null; armCursor(); }
    if (collect && collect.id === gone.id) { collect = null; armCursor(); }
    persist(); paint(ctx.video.currentTime, 0); renderStrip();
    shapeGone();
    if (insp && insp.kind === 'measure') renderInsp();
  }
  function clearShapes() {
    shapes = []; selected = null; adjust = null; collect = null; armCursor(); persist();
    if (layer) paint(ctx.video.currentTime, 0);
    renderStrip();
    shapeGone();
    if (insp && insp.kind === 'measure') renderInsp();
  }

  /* ---------------------------------------------------------------
     Editing the window — the part that was missing entirely
     --------------------------------------------------------------- */
  function setDur(sec) {
    defaultDur = clamp(sec, 1, 60);
    var s = shapeById(selected);
    if (s) {
      s.life = 'moment'; s.in = s.t; s.out = s.t + defaultDur;
      // a tracked mark is never cut off before the last place it was put
      var kt = keyTimes(s);
      if (kt.length && kt[kt.length - 1] > s.out) s.out = kt[kt.length - 1] + 0.5;
      touch(s);
      toast('Window ' + defaultDur.toFixed(1) + ' s · ' + clock(s.in) + '–' + clock(s.out));
    } else {
      toast('Next shape: ' + defaultDur.toFixed(1) + ' s');
    }
  }
  function togglePin() {
    var s = shapeById(selected);
    if (!s) return false;
    s.life = s.life === 'pinned' ? 'moment' : 'pinned';
    if (s.life === 'moment') { s.in = s.t; s.out = s.t + defaultDur; }
    touch(s);
    toast(s.life === 'pinned' ? '📌 Kept for the whole clip' : 'Back to a single moment');
    return true;
  }
  function nudge(frames) {
    var s = shapeById(selected);
    if (!s || s.life === 'pinned') return false;
    var d = frames / fps;
    s.t += d; s.in += d; s.out += d;
    touch(s);
    toast(clock(s.in) + '–' + clock(s.out));
    return true;
  }
  function setFreeze(sec) {
    var s = shapeById(selected);
    if (!s) return;
    s.freeze = sec > 0 ? sec : 0;
    touch(s);
    toast(s.freeze ? 'Freeze ' + s.freeze + ' s on export' : 'No freeze');
  }
  function resizeSpot(sid, f) {
    var s = shapeById(sid);
    if (!s || s.kind !== 'spotlight' || !layer) return;
    s.r = clamp(s.r * f, layer.h * RMIN, layer.h * RMAX);
    touch(s, true); persistSoon();
  }
  function selectShape(sid) {
    selected = sid;
    var s = shapeById(sid);
    adjust = (s && (s.kind === 'spotlight' || s.kind === 'link')) ? { id: sid } : null;
    armCursor();
    if (layer) paint(ctx.video.currentTime, 0);
    renderStrip();
    if (s) openInsp('shape', { id: sid });
    else if (insp && insp.kind === 'shape') {
      closeInsp();
      if (editor) openInsp('clip', {});
    }
  }

  /* ---------------------------------------------------------------
     The drawing tools

     Pointer events on the layer, but ONLY while a tool is armed — the video
     surface takes no click otherwise, which is a rule Film has had since it was
     written (a stray click costing the viewer their place) and which this must
     not quietly repeal.
     --------------------------------------------------------------- */
  /* Which of the two reasons the layer may take the pointer: a tool is armed,
     or a spotlight is being adjusted. Both are states the analyst stepped into
     deliberately, which is the only thing that may lift the "the video surface
     takes no click" rule. */
  function armCursor() {
    if (layer) {
      layer.svg.classList.toggle('fmt-armed', !!mode || !!collect);
      layer.svg.classList.toggle('fmt-adjust', !mode && !collect && !!adjust);
    }
    if (ctx && ctx.box) ctx.box.classList.toggle('fmt-drawing', !!mode || !!collect);
  }
  function armTool(kind, opts) {
    mode = kind ? Object.assign({ kind: kind }, opts || {}) : null;
    if (mode) adjust = null;
    ensureLayer();
    armCursor();
    toast(mode
      ? toolName(kind) + ' · ' + defaultDur.toFixed(1) + ' s — drag on the picture. '
        + '1–9 sets the duration, Backspace to leave.'
      : '');
  }
  function toolName(k) {
    return { arrow: 'Arrow', pen: 'Freehand', zone: 'Zone', text: 'Text',
             marker: 'Player marker', spotlight: 'Spotlight',
             link: 'Link players', measure: 'Measure' }[k] || k;
  }

  function onDown(e) {
    if (e.button !== 0) return;

    /* ONE click, ONE meaning. With the menu open this press is for shutting it,
       and it must not also drag a spotlight or begin a stroke. It stops here —
       and it still does not touch playback: the video surface has taken no
       transport click since Film was written, and dismissing a panel that is
       covering the frame is not a transport command. */
    if (menu) { closeMenu(); e.preventDefault(); e.stopPropagation(); return; }

    var p = toVideo(e.clientX, e.clientY); if (!p) return;

    // a link or an area being clicked out: every click on the picture is a point
    if (collect) {
      e.preventDefault(); e.stopPropagation();
      collectPoint(p);
      return;
    }
    if (mode && mode.kind === 'calib') {
      e.preventDefault(); e.stopPropagation();
      if (calDraft && calDraft.pts.length < 4) {
        calDraft.pts.push({ x: p.x, y: p.y, lm: '' });
        drawCalDraft();
        renderInsp();
      } else toast('That is four points. Pick which marking each one is, then Apply');
      return;
    }

    /* Moving the spotlight being adjusted. No tool is armed here — this is the
       mode a spotlight drops into the moment it is placed, so the analyst can
       put it exactly on the player instead of starting again. */
    if (!mode && adjust) {
      var sp = shapeById(adjust.id);
      if (!sp) { adjust = null; armCursor(); return; }
      var ix = 0;
      if (sp.kind === 'link') {
        // a press away from every player is not aimed at this link
        ix = nearestPoint(sp, p);
        if (ix < 0) return;
      }
      adjust.idx = ix;
      e.preventDefault(); e.stopPropagation();
      placeAdjust(sp, p, ix);
      try { layer.svg.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
      layer.svg.addEventListener('pointermove', onSpotMove);
      layer.svg.addEventListener('pointerup', onSpotUp);
      return;
    }
    if (!mode) return;
    e.preventDefault(); e.stopPropagation();
    // latched ONCE, and carried through the whole drag: the frame being aimed at
    anchor = ctx.video.currentTime;
    var base = { space: 'S', style: { color: mode.color || ACCENT, width: strokeW() } };
    if (mode.freeze) base.freeze = mode.freeze;

    if (mode.kind === 'text') { textAt(p, base, anchor); return; }
    if (mode.kind === 'spotlight') {
      var ns = addShape(newSpot(p), anchor);
      selectShape(ns.id);
      return;
    }
    if (mode.kind === 'measure') {
      if (!calOk(anchor)) {
        mode = null; armCursor();
        toast('The camera may have moved. Calibrate this frame first', true);
        renderInsp();
        return;
      }
      base.H = cal.H; base.units = units; base.sub = mode.sub;
      base.style.color = '#FFFFFF';
      if (mode.sub === 'area') {
        var ma = addShape(Object.assign(base, { kind: 'measure', pts: [{ x: p.x, y: p.y }] }), anchor);
        collect = { id: ma.id };
        armCursor();
        renderInsp();
        return;
      }
    }
    if (mode.kind === 'marker') {
      addShape(Object.assign(base, { kind: 'marker', at: p,
        r: Math.round(layer.h * 0.028) }), anchor);
      return;
    }
    draft = Object.assign(base, mode.kind === 'pen'
      ? { kind: 'pen', pts: [[p.x, p.y]] }
      : { kind: mode.kind, from: p, to: p, dash: !!mode.dash, curved: !!mode.curved });
    try { layer.svg.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    layer.svg.addEventListener('pointermove', onMove);
    layer.svg.addEventListener('pointerup', onUp);
    drawDraft();
  }
  function onMove(e) {
    if (!draft) return;
    var p = toVideo(e.clientX, e.clientY); if (!p) return;
    if (draft.kind === 'pen') draft.pts.push([p.x, p.y]); else draft.to = p;
    drawDraft();
  }
  function onUp() {
    layer.svg.removeEventListener('pointermove', onMove);
    layer.svg.removeEventListener('pointerup', onUp);
    if (!draft) return;
    var d = draft; draft = null; layer.gDraft.textContent = '';
    var tiny = d.kind === 'pen' ? d.pts.length < 3
             : Math.abs(d.to.x - d.from.x) + Math.abs(d.to.y - d.from.y) < 12;
    if (tiny) return;                        // a click that was not a drag is not a shape
    if (d.curved) {
      // one control point, pushed off the midpoint by a quarter of the span:
      // enough to read as a run rather than a pass without asking for a second drag
      var mx = (d.from.x + d.to.x) / 2, my = (d.from.y + d.to.y) / 2;
      var dx = d.to.x - d.from.x, dy = d.to.y - d.from.y;
      d.curve = { x: mx - dy * 0.25, y: my + dx * 0.25 };
    }
    delete d.curved;
    if (d.kind === 'measure') measureValue(d);
    commit(d, anchor);
    if (insp && insp.kind === 'measure') renderInsp();
  }

  /* Dragging the adjusted spotlight around. Repaint every move, save once. */
  function onSpotMove(e) {
    if (!adjust) return;
    var p = toVideo(e.clientX, e.clientY); if (!p) return;
    var sp = shapeById(adjust.id); if (!sp) return;
    placeAdjust(sp, p, adjust.idx || 0);
  }
  function onSpotUp() {
    layer.svg.removeEventListener('pointermove', onSpotMove);
    layer.svg.removeEventListener('pointerup', onSpotUp);
    persist(); renderStrip();
    if (insp && insp.kind === 'shape') renderInsp();
  }
  function nearestPoint(s, p) {
    var r = resolved(s, ctx.video.currentTime), best = -1, bd = hOf() * 0.06;
    (r.pts || []).forEach(function (q, i) {
      var d = Math.sqrt(Math.pow(q.x - p.x, 2) + Math.pow(q.y - p.y, 2));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /* The keyboard has no pointer, so the pointer is remembered. Three lines, and
     they are what make S worth pressing: aim, press, wheel to size, done —
     without the hand ever leaving the mouse. */
  function onPtr(e) { ptr = toVideo(e.clientX, e.clientY); }

  /* ONE wheel, TWO jobs, and the arbitration IS the design:
       a spotlight is being adjusted  -> the wheel is its radius
       anything else                  -> the wheel is the zoom

     Three refusals, each with a reason that was measured rather than assumed:
       - outside full screen the wheel belongs to the page;
       - ctrl/cmd + wheel is the BROWSER's own zoom, and taking it breaks an
         accessibility control the operating system provides;
       - the listener sits on ctx.stage, never on document, and preventDefault
         is called only after the event was actually used — because
         Stats/stats-view.css deliberately gives .film-full `overflow:auto`
         under 900px, and swallowing the wheel there would kill a scroll its
         author wrote on purpose. */
  function onWheel(e) {
    if (!ctx || !full) return;
    if (e.ctrlKey || e.metaKey) return;
    var up = e.deltaY < 0;
    var adj = adjust && shapeById(adjust.id);
    if (adj && adj.kind === 'spotlight') resizeSpot(adjust.id, up ? 1.08 : 1 / 1.08);
    else zoomBy(up ? 1.1 : 1 / 1.1, toVideo(e.clientX, e.clientY));
    e.preventDefault();
  }
  function drawDraft() {
    if (!layer) return;
    layer.gDraft.textContent = '';
    if (draft) layer.gDraft.appendChild(shapeNode(draft, 0));
  }
  function strokeW() { return Math.max(3, Math.round((layer ? layer.h : 1080) * 0.005)); }

  /* ---------------------------------------------------------------
     The timeline lane — the thing that makes the windows VISIBLE

     Every shape as a bar sitting at its own window, so "what is alive, and
     when" stops being a number buried in a file.

     IT GOES IN THE BLACK BAR ABOVE THE PICTURE, and that is measured rather
     than chosen: #fmStage has exactly two children, and the second is
     .film-cap — the caption, anchored bottom:0, clamp(38px,5vh,54px) tall in
     full screen out of the 73.5px the letterbox leaves. The bottom bar is
     already spoken for by a feature that was here first; the top one is empty.
     --------------------------------------------------------------- */
  var STRIP_H = 26, STRIP_NEED = 34;

  function empty(n) { while (n.children && n.children.length) n.removeChild(n.children[0]); }
  function stripWanted() { return !!(ctx && full && stripOn && (shapes.length || laneTags().length)); }
  /* Only the tags that fall inside this half have anywhere to sit on its lane. */
  function laneTags() {
    if (!ctx || !ctx.win) return [];
    var a = ctx.win.start, b = ctx.end();
    return tagList().filter(function (x) { return x.tOut > a && x.tIn < b; });
  }
  function stripHeight() { return strip && strip.tagLane ? STRIP_H + 18 : STRIP_H; }

  function ensureStrip() {
    if (!stripWanted()) { dropStrip(); return null; }
    if (strip) return strip;
    var box = el('div', 'fmt-strip'), lane = el('div', 'fmt-lane'), cur = el('div', 'fmt-cur');
    box.appendChild(lane); box.appendChild(cur);
    ctx.stage.appendChild(box);
    strip = { el: box, lane: lane, cur: cur, bars: {} };
    renderStrip();
    return strip;
  }
  function dropStrip() {
    if (strip && strip.el.parentNode) strip.el.parentNode.removeChild(strip.el);
    strip = null;
  }
  function placeStrip() {
    if (!strip || !ctx) return;
    var r = pictureRect(); if (!r) return;
    var s = ctx.stage.getBoundingClientRect();
    var head = r.y - s.y;                       // the black bar above the picture
    var st = strip.el.style, H0 = stripHeight();
    st.left = (r.x - s.x) + 'px';
    st.width = r.w + 'px';
    st.height = H0 + 'px';
    // room in the letterbox: sit in it, and cover no grass at all
    if (head >= H0 + (STRIP_NEED - STRIP_H)) {
      st.top = Math.max(0, head - H0 - 4) + 'px';
      strip.el.classList.remove('fmt-over');
    } else {                                    // no room: lie over the top edge instead
      st.top = (head + 2) + 'px';
      strip.el.classList.add('fmt-over');
    }
  }
  function stripSpan() {
    var w0 = ctx.win.start, w1 = ctx.end();
    return { a: w0, span: Math.max(0.001, w1 - w0) };
  }
  function renderStrip() {
    if (!stripWanted()) { dropStrip(); return; }
    if (!strip) { ensureStrip(); return; }
    var sp = stripSpan();
    empty(strip.lane);
    strip.bars = {};
    shapes.forEach(function (s) {
      var pinned = s.life === 'pinned';
      var a = pinned ? sp.a : clamp(s.in, sp.a, sp.a + sp.span);
      var b = pinned ? sp.a + sp.span : clamp(s.out, sp.a, sp.a + sp.span);
      var bar = el('div', 'fmt-bar' + (s.id === selected ? ' on' : '') + (pinned ? ' pin' : ''));
      bar.style.left = ((a - sp.a) / sp.span * 100) + '%';
      bar.style.width = Math.max(0.4, (b - a) / sp.span * 100) + '%';
      bar.style.background = (s.style && s.style.color) || ACCENT;
      bar.title = toolName(s.kind) + ' · ' + clock(s.in) + '–' + clock(s.out)
                + (pinned ? ' · 📌' : '') + (s.freeze ? ' · ❚❚ ' + s.freeze + 's' : '');
      bar.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        selectShape(s.id);
        ctx.seek(s.t);                          // back to the frame it was drawn on
      };
      strip.lane.appendChild(bar);
      strip.bars[s.id] = bar;
    });
    renderTagLane(sp);
    placeStrip();
    placeInsp();
  }
  function renderTagLane(sp) {
    var tags = laneTags();
    if (!tags.length) {
      if (strip.tagLane) { strip.el.removeChild(strip.tagLane); strip.tagLane = null; }
      strip.el.classList.remove('two');
      return;
    }
    if (!strip.tagLane) {
      strip.tagLane = el('div', 'fmt-lane2');
      strip.el.appendChild(strip.tagLane);
    }
    strip.el.classList.add('two');
    empty(strip.tagLane);
    tags.forEach(function (x) {
      var a = clamp(x.tIn, sp.a, sp.a + sp.span), b = clamp(x.tOut, sp.a, sp.a + sp.span);
      var bar = el('div', 'fmt-bar');
      bar.style.left = ((a - sp.a) / sp.span * 100) + '%';
      bar.style.width = Math.max(0.4, (b - a) / sp.span * 100) + '%';
      bar.style.background = x.color || '#6C6164';
      bar.title = tagTitle(x) + ' · ' + clock(x.tIn) + '–' + clock(x.tOut) + (x.note ? ' · ' + x.note : '');
      bar.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        ctx.seek(x.tIn);
      };
      strip.tagLane.appendChild(bar);
    });
  }
  function tagTitle(x) {
    if (x.code) return x.code;
    var pl = ((tagData && tagData.playlists) || []).filter(function (q) { return q.id === x.playlistId; })[0];
    return pl ? pl.name : 'Tag';
  }
  function stripCursor(now) {
    if (!strip || !ctx) return;
    var sp = stripSpan();
    strip.cur.style.left = (clamp((now - sp.a) / sp.span, 0, 1) * 100) + '%';
  }
  function toggleStrip(on) {
    stripOn = on == null ? !stripOn : !!on;
    if (stripOn) ensureStrip(); else dropStrip();
    toast(stripOn ? 'Timeline shown' : 'Timeline hidden');
  }

  /* A real input, placed where the click was: typing into a prompt() would take
     the focus out of the document and, in some browsers, out of full screen. */
  function textAt(p, base, at) {
    var r = pictureRect(), s = ctx.stage.getBoundingClientRect();
    var inp = el('input', 'fmt-text-in');
    inp.type = 'text'; inp.placeholder = 'Type, then press Enter';
    inp.style.left = (r.x - s.x + p.x / layer.w * r.w) + 'px';
    inp.style.top = (r.y - s.y + p.y / layer.h * r.h) + 'px';
    ctx.stage.appendChild(inp);
    inp.focus();
    /* `shut` is idempotence, not decoration: Enter removes the field, and a
       browser that then fires blur on the removed node would run this a second
       time and commit the same caption twice. Typing is also the slowest thing
       in the toolkit, which is why the anchor is the frame the tool was aimed
       at rather than wherever the clock has got to by the time Enter lands. */
    var shut = false;
    var done = function (ok) {
      if (shut) return;
      shut = true;
      var v = inp.value.trim();
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (ok && v) commit(Object.assign(base, { kind: 'text', at: p, text: v }), at);
    };
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      else if (e.key === 'Escape' || e.key === 'Backspace' && !inp.value) { e.stopPropagation(); done(false); }
    });
    inp.addEventListener('blur', function () { done(true); });
  }

  /* ---------------------------------------------------------------
     A short-lived line of text over the frame. Used for tool hints and for
     "rendered 12s / 40s" — never for anything the analyst must not miss.
     --------------------------------------------------------------- */
  var toastEl = null, toastT = 0;
  function toast(msg, sticky) {
    if (!ctx || !ctx.box) return;
    if (!toastEl) { toastEl = el('div', 'fmt-toast'); ctx.box.appendChild(toastEl); }
    clearTimeout(toastT);
    if (!msg) { toastEl.classList.remove('on'); return; }
    toastEl.textContent = msg; toastEl.classList.add('on');
    /* detach() drops the node this closes over, and a redraw inside the 2.6s
       used to leave the timer waking up to a null: an uncaught TypeError every
       time the analyst was told something and then changed half. detach() now
       clears the timer as well; the guard is what makes that cheap to trust. */
    if (!sticky) toastT = setTimeout(function () {
      if (toastEl) toastEl.classList.remove('on');
    }, 2600);
  }

  /* ---------------------------------------------------------------
     Playback extras
     --------------------------------------------------------------- */
  function step(frames) {
    if (!ctx) return;
    ctx.pause();
    ctx.seek(ctx.video.currentTime + frames / fps);
  }
  function setSpeed(k) {
    if (!ctx) return;
    ctx.video.playbackRate = k;
    toast('Speed ' + k + '×');
  }
  /* fps is not exposed by any API, so it is measured: rVFC reports how many
     frames the compositor has actually presented, and the difference over a
     short run of them is the rate. 25 until then, which is right for most
     European match footage and wrong by 20% at worst. */
  function measureFps() {
    var v = ctx && ctx.video;
    if (!v || !v.requestVideoFrameCallback) return;
    var first = null, n = 0;
    var tick = function (now, meta) {
      if (!ctx || ctx.video !== v) return;
      if (first == null) { first = meta; n = 0; }
      else if (++n >= 10) {
        var dt = meta.mediaTime - first.mediaTime;
        var df = meta.presentedFrames - first.presentedFrames;
        if (dt > 0.05 && df > 0) fps = clamp(Math.round(df / dt), 10, 120);
        return;
      }
      v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback(tick);
  }

  /* ---------------------------------------------------------------
     Clips — a window on the same file, which is what Film has always played
     --------------------------------------------------------------- */
  var MIN_CLIP = 0.5;      // both ends on one frame is not a clip, it is a slip

  /* `at` is the moment the mark belongs to, and the MENU passes it for the same
     reason every drawing item passes hit.t: the video is NOT paused while the
     menu is up, so by the time an item is chosen the clock has moved on.
     Measured on the live site — the menu header said 47:30 and the mark landed
     1.82s later, which is exactly how long the item took to read. The keyboard
     passes nothing and gets "now", which is what a key press means. */
  function markAt(which, at) {
    if (!ctx) return;
    mark[which] = at != null ? at : ctx.video.currentTime;
    var a = mark.in, b = mark.out;
    /* Both ends on one frame used to be saved as a 0-second clip, which the
       export then refused with "Nothing has been marked yet" — a clip that
       existed only to say no. Drop the end just taken instead, so the other one
       stays up and can still be closed properly. */
    if (a != null && b != null && Math.abs(b - a) < MIN_CLIP) {
      mark[which] = null;
      toast('Both ends are on the same frame — move the clock, then mark again');
      renderMark();
      return;
    }
    if (a != null && b != null && b < a) { mark.in = b; mark.out = a; }
    toast(which === 'in' ? 'Clip start ' + clock(mark.in) : 'Clip end ' + clock(mark.out));
    if (mark.in != null && mark.out != null) saveClip(mark.in, mark.out);
    renderMark();
  }

  /* ---------------------------------------------------------------
     The pending mark, made visible.

     A clip is two presses apart, and between them the only thing that said so
     was a toast that had already gone: press [ , look for what changed, find
     nothing, and conclude the key is dead. This line stays up for exactly as
     long as one end is waiting for the other.
     --------------------------------------------------------------- */
  var markEl = null;
  function renderMark() {
    var want = !!(ctx && ctx.box && full && (mark.in != null || mark.out != null));
    if (!want) { if (markEl) markEl.classList.remove('on'); return; }
    if (!markEl) { markEl = el('div', 'fmt-mark'); ctx.box.appendChild(markEl); }
    markEl.textContent = mark.in != null
      ? '⟦ Clip start ' + clock(mark.in) + ' — press ] for the end'
      : '⟧ Clip end ' + clock(mark.out) + ' — press [ for the start';
    markEl.classList.add('on');
  }

  function saveClip(a, b, title) {
    var list = clips();
    var c = {
      id: id(), in: a, out: b,
      title: title || ('Clip ' + clock(a)),
      shapes: shapes.filter(function (s) { return s.out >= a && s.in <= b; })
                    .map(function (s) { return JSON.parse(JSON.stringify(s)); })
    };
    list.push(c); setClips(list);
    mark = { in: null, out: null };
    renderMark();                      // whoever called, the line above is over
    toast('Saved "' + c.title + '" (' + Math.round(b - a) + 's)');
    if (panel) renderPanel();
    return c;
  }
  /* The highest-value clip button in the app: 1 300 events already carry a
     timestamp, so most "cutting" is not cutting at all — it is naming a window
     around something the analyst tagged months ago. */
  function clipFromEvent(pad) {
    if (!ctx) return;
    var now = ctx.video.currentTime, best = null, bd = 1e9;
    ctx.cues.forEach(function (c) {
      var d = Math.abs(c.t - now);
      if (d < bd) { bd = d; best = c; }
    });
    if (!best) { toast('No tagged event near here'); return; }
    pad = pad || 6;
    var a = Math.max(ctx.win.start, best.t - pad), b = Math.min(ctx.end(), best.t + pad);
    var label = (best.rows[0] && best.rows[0].event) || 'event';
    saveClip(a, b, clock(best.t) + ' ' + label);
  }
  /* Playing a clip does NOT touch the match drawing.

     It used to: `shapes = c.shapes` replaced the whole list with the clip's
     copy, and the next persist() wrote that truncated list to disk — measured,
     four marks became one and then two were saved, with the marks at 600s and
     1200s gone for good. It was never needed either, because the time window
     already does the job: inside [c.in, c.out] exactly the shapes whose window
     overlaps that stretch are alive. c.shapes stays in the schema for the
     export, which may be asked to rebuild a clip the analyst has since erased. */
  function playClip(c) {
    if (!ctx) return;
    play = { clip: c, list: play && play.list, i: play && play.i };
    if (editor && editor.clip.id !== c.id) closeEditor();
    if (c.edit) beginPreview(c);
    ensureLayer();
    ctx.seek(c.in); ctx.play();
    toast('▶ ' + c.title);
  }
  function playAll() {
    var list = clips();
    if (!list.length) { toast('No clips yet'); return; }
    play = { list: list, i: 0, clip: list[0] };
    playClip(list[0]);
    play.list = list; play.i = 0;
  }
  function advancePlaylist() {
    if (!play || !play.list) { play = null; if (!editor) endPreview(); return; }
    var next = play.list[play.i + 1];
    if (!next) {
      play = null; ctx.pause();
      if (!editor) endPreview();
      toast('End of playlist');
      return;
    }
    play.i++; play.clip = next;
    playClip(next);
    play.list = clips(); play.i = play.i;
  }

  /* ---------------------------------------------------------------
     Export: one frame, as a PNG at the video's own resolution
     --------------------------------------------------------------- */
  /* The overlay for ONE frame, built DETACHED.

     It used to call paint(), which meant a forty-second render drove the
     analyst's own screen off its clock — their picture jumping about with the
     progress bar. With a lane and a selection outline on screen that stops
     being merely odd. Same renderer either way (shapeNode + alpha), different
     destination: that is the whole change. The mask id is a constant because
     each frame is its own standalone document, and a stable string is what lets
     the caller's lastSvg cache skip a rasterisation. */
  function overlaySVGString(now, phase) {
    var w = layer ? layer.w : ctx.video.videoWidth;
    var h = layer ? layer.h : ctx.video.videoHeight;
    var g = svgEl('g', {}), live = liveAt(now);
    dimNodes(live.map(function (s) { return resolved(s, now); }), 'x')
      .forEach(function (n) { g.appendChild(n); });
    live.forEach(function (s) {
      var n = shapeNode(resolved(s, now), phase);
      n.setAttribute('opacity', alpha(s, now));
      g.appendChild(n);
    });
    return '<svg xmlns="' + SVGNS + '" width="' + w + '" height="' + h
         + '" viewBox="0 0 ' + w + ' ' + h + '">' + g.innerHTML + '</svg>';
  }
  function overlayImage(str) {
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { fail(new Error('overlay')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    });
  }
  function download(blob, name) {
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }
  function savePNG() {
    if (!ctx) return;
    var v = ctx.video;
    var c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    var g = c.getContext('2d');
    try { g.drawImage(v, 0, 0, c.width, c.height); }
    catch (e) { toast('This video will not let the page read its pixels — see §11 of the design'); return; }
    overlayImage(overlaySVGString(v.currentTime, 0)).then(function (img) {
      g.drawImage(img, 0, 0, c.width, c.height);
      /* A canvas tainted by the video THROWS here — measured, SecurityError
         from both toBlob() and toDataURL() — it does not hand back the null
         blob the callback was written for. Without this the throw travelled on
         to .catch() below and blamed the graphics layer for a header the video
         host never sent. Both routes are kept: browsers differ. */
      try {
        c.toBlob(function (b) {
          if (!b) { toast('The browser refused to read the frame (CORS)'); return; }
          download(b, fileStem() + '_' + clock(v.currentTime).replace(':', 'm') + 's.png');
          toast('Frame saved');
        }, 'image/png');
      } catch (e) { toast('The browser refused to read the frame (CORS)'); }
    }).catch(function () { toast('The graphics layer could not be built'); });
  }
  function fileStem() {
    var m = ctx.meta || {};
    return String((m.home || 'Home') + '_vs_' + (m.away || 'Away')).replace(/[^\w.-]+/g, '_');
  }

  /* ---------------------------------------------------------------
     Export: a real .mp4, rendered here, saved to the analyst's own disk

     Nothing is uploaded. The bytes go canvas -> MediaRecorder -> Blob -> the
     folder the analyst picked, and the only traffic to Cloudflare in the whole
     operation is the range GET the player was making anyway.

     The frame pump is OURS — captureStream(0) plus requestFrame() — and that is
     not a detail. requestAnimationFrame stops dead in a hidden tab (measured:
     zero callbacks in 19 seconds), so a renderer clocked off it hangs the moment
     the analyst looks at something else, while MediaRecorder's own clock keeps
     running. With an explicit pump the same conditions still made 29.6fps.
     --------------------------------------------------------------- */
  function pickMime() {
    var want = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E',
                'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    for (var i = 0; i < want.length; i++)
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(want[i])) return want[i];
    return '';
  }

  /* ---------------------------------------------------------------
     Opening the source — and why it is done TWICE on failure

     `crossOrigin = "anonymous"` is a requirement, not a hint: with it set, a
     server that sends no Access-Control-Allow-Origin makes the file fail to
     LOAD AT ALL. Measured against the public bucket this site serves video
     from: a request carrying an Origin header comes back with no
     Access-Control-Allow-Origin and no Vary: Origin at all.

     So the export died on a perfectly good file and blamed the file. It cannot
     be fixed by dropping the attribute either — a video without CORS taints
     the canvas, and a tainted canvas cannot be read, saved, or recorded. The
     fix belongs on the bucket (docs/film-export-cors-design.md §3).

     What CODE can do is stop lying about the cause. Open once with the
     attribute; if that fails, open once more WITHOUT it. If the second attempt
     succeeds the file is fine and the header is missing — which is a different
     sentence, pointing at a different thing to go and fix. The second element
     renders nothing and is thrown away the moment it has answered. */
  var NEED_CORS = 'The video host has not enabled CORS, so clips cannot be rendered. '
    + 'The bucket needs an Access-Control-Allow-Origin header — see docs/film-export-cors-design.md §3.';
  var corsState = null;      // null = not known yet · false = measured, and the header is missing

  /* The same file, under a URL the browser's cache has never seen.

     THIS IS THE ONE THAT ACTUALLY BIT, and the bucket was innocent. Measured
     2026-08-24: curl -H "Origin: https://hoangnams.com" gets back
     `Access-Control-Allow-Origin: https://hoangnams.com` and a 206 — the CORS
     policy is there and correct. The browser still refused, saying no such
     header was present, because the PLAYER had already streamed that exact URL
     with no crossorigin and therefore no Origin header. The response sitting in
     the HTTP cache carries no ACAO, and the export's CORS request is answered
     out of that cache. One parameter is a different cache entry, so the request
     really goes to the network and comes back with the header on it.

     A parameter can invalidate a signature, so this is a RETRY and never the
     first attempt: a source that opens cleanly is never rewritten. */
  function corsUrl(src) {
    return src + (src.indexOf('?') < 0 ? '?' : '&') + 'cors=1';
  }

  function openSource(src, withCors) {
    return new Promise(function (ok, no) {
      var el = document.createElement('video');
      if (withCors) el.crossOrigin = 'anonymous';
      el.preload = 'auto'; el.muted = false; el.playsInline = true;
      var done = false;
      el.addEventListener('loadedmetadata', function () {
        if (done) return; done = true; ok(el);
      });
      el.addEventListener('error', function () {
        if (done) return; done = true; no(el);
      });
      el.src = src;
    });
  }
  function dropSource(el) {
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* already gone */ }
  }

  function exportClip(a, b, title, edit) {
    if (busy) { toast('Another clip is already rendering'); return; }
    if (!ctx) return;
    if (a == null || b == null || b <= a) { toast('Nothing has been marked yet'); return; }
    // once one render has proved the header is missing, say so at once rather
    // than build a recorder, an audio graph and a canvas to learn it again
    if (corsState === false) { toast(NEED_CORS, true); return; }
    var mime = pickMime();
    if (!mime) { toast('This browser cannot render video'); return; }
    var mp4 = mime.indexOf('mp4') >= 0;
    if (!mp4) toast('This browser can only make .webm — use Chrome or Edge for .mp4', true);

    busy = true;
    var src = ctx.video.currentSrc || ctx.video.src;
    var W = ctx.video.videoWidth, H = ctx.video.videoHeight;
    var ext = mp4 ? 'mp4' : 'webm';
    var name = (fileStem() + '_' + (title || clock(a))).replace(/[^\w.-]+/g, '_') + '.' + ext;

    /* A SEPARATE video element, so the analyst's own playback is not dragged
       around by the render — and so this one can carry crossorigin without ever
       risking the one on screen. It is opened below rather than here, because
       opening it is now a two-step question (see openSource). */
    var v = null;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    var stream = canvas.captureStream(0);
    var track = stream.getVideoTracks()[0];

    var actx = null;
    var chunks = [], rec, stopped = false, lastSvg = '', lastImg = null;

    /* FREEZE SEGMENTS (Q1 = B).

       A shape may say "stop here for N seconds", and the exported file then
       holds that single frame while the graphics are read before letting the
       match run on — which is what a broadcast telestration actually looks
       like, and why the output is LONGER than the stretch it was cut from.

       Several shapes routinely name the same moment (an arrow, a zone and a
       caption on one frame), so points within a quarter of a second of each
       other are merged and the longest hold wins. Otherwise a busy frame would
       stop the film three times over.

       The source element is paused for the duration, so the recorded audio
       goes quiet across the hold. That is the right answer rather than a
       shortcoming: commentary carrying on over a frozen picture is worse. */
    var plan = planOf(a, b, edit, shapes);
    var freezes = plan.freezes, holdTotal = plan.holdTotal;
    var total = plan.total;               // what the FILE will run to, not the source
    var si = 0;                           // which segment of the plan is playing
    // captions belong to this clip alone, whatever the screen happens to be showing
    exportTexts = (edit && edit.texts) || [];
    var fi = 0, frozen = null, outT = 0;  // outT: seconds of output emitted so far

    var finish = function () {
      busy = false;
      exportTexts = null;
      if (actx) try { actx.close(); } catch (e) {}
      if (v) dropSource(v);
    };
    var fail = function (msg) {
      stopped = true;
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
      finish(); toast(msg, true);
    };

    /* Two beats. The first is the only one that can produce a clean canvas; the
       second exists solely to tell the analyst WHICH thing is broken. */
    /* Three questions, in the order that tells them apart:
         1. does it open WITH crossorigin?            → render
         2. does it open with crossorigin off the cache's path?  → render
         3. does it open without crossorigin at all?  → the header really is missing
       Step 2 is the one that rescues the ordinary case, where the only thing
       wrong is that the player got there first — see corsUrl(). Only when the
       header is genuinely absent does step 3 reach NEED_CORS, so that sentence
       still means what it says. */
    openSource(src, true).then(opened, function () {
      openSource(corsUrl(src), true).then(opened, function () {
        openSource(src, false).then(function (el) {
          dropSource(el);                   // it opened, so the file is fine
          corsState = false;                // remembered: the drawer dims ⭳ from now on
          if (panel) renderPanel();
          fail(NEED_CORS);
        }, function () {
          fail('The video file could not be opened — bad URL, or the file is gone.');
        });
      });
    });

    function opened(el) {
      if (stopped) { dropSource(el); return; }
      v = el;
      corsState = true;
      /* Audio is wired only once an element exists. Not connected to
         actx.destination: this is an offscreen element the analyst never sees,
         and a render should not talk over them. */
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          actx = new AC();
          var dest = actx.createMediaStreamDestination();
          var gain = actx.createGain();
          gain.gain.value = plan.mute ? 0 : 1;   // silent, but still a track: players expect one
          actx.createMediaElementSource(v).connect(gain);
          gain.connect(dest);
          dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
        }
      } catch (e) { actx = null; }          // no audio is better than no clip

      // a tainted canvas throws only when it is read, so it is proved here, on
      // one pixel, before forty seconds of the analyst's time are spent
      v.currentTime = plan.segs[0].a;
      v.addEventListener('seeked', function once() {
        v.removeEventListener('seeked', once);
        try { g.drawImage(v, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1); }
        catch (e) {
          corsState = false;
          if (panel) renderPanel();
          fail('This video will not let the page read its pixels (CORS) — cannot render'); return;
        }
        start();
      });
    }

    function start() {
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
      } catch (e) { fail('MediaRecorder refused: ' + (e && e.message)); return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        finish();
        if (stopped) return;
        var blob = new Blob(chunks, { type: mime.split(';')[0] });
        download(blob, name);
        toast('Saved ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB)', true);
      };
      rec.start(1000);
      v.playbackRate = plan.segs[0].speed;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      pump();
    }

    /* One output frame. The clock is the SOURCE's currentTime, so the drawing
       lands on the frame it was put on rather than on whichever frame the
       machine happened to be ready for. */
    /* One output frame: the picture at `t`, the overlay as it stands at `t`,
       and `ph` driving the pulse — separate from `t` so a frozen frame can go
       on beating instead of standing dead still. */
    function drawOne(t, ph, cb) {
      g.drawImage(v, 0, 0, W, H);
      var phase = Math.round(((ph * 1.2) % 1) * 8) / 8;      // 8 buckets: the cache holds
      var str = overlaySVGString(t, phase);
      var after = function () {
        if (lastImg) g.drawImage(lastImg, 0, 0, W, H);
        var dark = fadeAlpha(plan.segs, t);
        if (dark > 0) {
          g.globalAlpha = dark; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
        }
        track.requestFrame();
        outT += 1 / fps;
        toast('Rendering — ' + Math.round(clamp(outT / total, 0, 1) * 100) + '% ('
              + Math.round(outT) + 's / ' + Math.round(total) + 's). Keep this tab open.', true);
        cb();
      };
      if (str !== lastSvg) {
        lastSvg = str;
        /* A rejection used to fall through to after(), which drew the frame with
           lastImg still null — the file came out looking finished but with no
           graphics on it at all. A render that cannot draw the drawing must stop
           and say so, not hand over a clip that is quietly wrong. */
        overlayImage(str).then(function (img) { lastImg = img; after(); },
          function () { fail('The graphics layer could not be built — stopping, rather than hand over a clip with the drawings missing.'); });
      } else after();
    }
    function pump() {
      if (stopped) return;
      // the pump drives ITSELF off a timer. Not rAF: measured, rAF stops dead
      // in a hidden tab while MediaRecorder's clock keeps running.
      var again = function () { setTimeout(pump, 1000 / fps); };

      /* Holding. The element is paused, so drawImage keeps yielding the same
         picture; the clock that ends the hold is the wall clock, because that
         is what MediaRecorder is writing against. */
      if (frozen) {
        if (Date.now() >= frozen.until) {
          frozen = null;
          var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
          again();
          return;
        }
        drawOne(frozen.t, (Date.now() - frozen.from) / 1000 + frozen.t, again);
        return;
      }

      var now = v.currentTime, sg = plan.segs[si];
      if (now >= sg.b - 0.001 || v.ended) {
        var nx = plan.segs[++si];
        if (!nx) {
          try { rec.stop(); } catch (e) {}
          return;
        }
        if (Math.abs(nx.a - sg.b) < 0.02) {    // the next segment simply carries on
          v.playbackRate = nx.speed;
          setTimeout(pump, 0);
          return;
        }
        jumpTo(nx);
        return;
      }
      if (fi < freezes.length && now >= freezes[fi].t) {
        try { v.pause(); } catch (e) {}
        frozen = { t: now, from: Date.now(), until: Date.now() + freezes[fi].hold * 1000 };
        fi++;
        setTimeout(pump, 0);
        return;
      }
      drawOne(now, now, again);
    }
    /* A stretch was cut out, so the source has to jump. The recorder is paused
       across the seek so the file holds no gap and no stale frame; a seek that
       never answers stops the render instead of hanging it for ever. */
    function jumpTo(seg) {
      try { v.pause(); if (rec.state === 'recording') rec.pause(); } catch (e) {}
      var settled = false;
      var go = function () {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        v.removeEventListener('seeked', go);
        if (stopped) return;
        v.playbackRate = seg.speed;
        try { if (rec.state === 'paused') rec.resume(); } catch (e) {}
        var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
        setTimeout(pump, 0);
      };
      var guard = setTimeout(function () {
        if (settled) return;
        settled = true;
        v.removeEventListener('seeked', go);
        fail('The video stopped answering while jumping to the next segment. Nothing was saved.');
      }, 15000);
      v.addEventListener('seeked', go);
      v.currentTime = seg.a;
    }
  }

  /* ---------------------------------------------------------------
     Starting the new tools
     --------------------------------------------------------------- */
  /* Anything aimed at players needs them to stay put while it is aimed. The
     right-click itself never stops the film; choosing one of these does, and it
     goes back to the frame that was pointed at. */
  function holdAt(t) {
    if (!ctx) return;
    ctx.pause();
    if (t != null && Math.abs(ctx.video.currentTime - t) > 0.001) ctx.seek(t);
  }
  function newSpot(p) {
    return { kind: 'spotlight', space: 'S', at: p, look: 'both', r: Math.round(hOf() * 0.04),
             showLabel: true, style: { color: ACCENT, width: strokeW() } };
  }
  function startLink(sub, t) {
    if (!ctx) return;
    holdAt(t);
    ensureLayer();
    if (!layer) return;
    var s = addShape({ kind: 'link', space: 'S', sub: sub, pts: [], lineStyle: 'solid',
                       units: units, style: { color: AWAY, width: strokeW() } }, t);
    selectShape(s.id);
    collect = { id: s.id };
    armCursor();
    renderInsp();
    toast('Click each player on the picture, then press Finish');
  }
  /* Enough points to mean something, or it was never a shape at all. */
  function collectEnough(s) {
    var n = (s.pts || []).length;
    if (s.kind === 'measure') return n >= 3;
    return n >= (s.sub === 'shape' ? 3 : 2);
  }
  function finishCollect() {
    if (!collect) return;
    var s = shapeById(collect.id);
    collect = null;
    armCursor();
    if (s && !collectEnough(s)) {
      removeShape(s.id);
      toast(s.kind === 'measure' ? 'An area needs at least three points'
        : s.sub === 'shape' ? 'A shape needs at least three players' : 'A link needs at least two players');
      if (s.kind === 'measure' && insp && insp.kind === 'measure') renderInsp();
      return;
    }
    if (s) { persist(); renderStrip(); }
    renderInsp();
  }
  function collectPoint(p) {
    var s = shapeById(collect.id);
    if (!s) { collect = null; armCursor(); return; }
    if (s.kind === 'measure') {
      s.pts.push({ x: p.x, y: p.y });
      measureValue(s);
    } else {
      var q = { x: p.x, y: p.y };
      if (s.track) q.keys = [{ t: ctx.video.currentTime, x: p.x, y: p.y }];
      s.pts.push(q);
    }
    touch(s);
    renderInsp();
  }
  /* A tracked point keeps a key on the frame it was moved on; an untracked one
     simply moves. Moving a key past the end of the window carries the window
     along, or the mark would vanish under the analyst's hand. */
  function extendFor(s, t) {
    if (s.life === 'pinned') return;
    if (t + 1 > s.out) s.out = t + 1;
    if (t < s.in) s.in = t;
  }
  function placeAdjust(s, p, idx) {
    var now = ctx.video.currentTime;
    if (s.kind === 'spotlight') {
      s.at = p;
      if (s.keys) { upsertKey(s.keys, now, p); extendFor(s, now); }
    } else if (s.kind === 'link' && s.pts[idx]) {
      var q = s.pts[idx];
      q.x = p.x; q.y = p.y;
      if (q.keys) { upsertKey(q.keys, now, p); extendFor(s, now); }
    }
    touch(s, true);
    persistSoon();
  }
  function setTrack(s, on) {
    var now = ctx.video.currentTime, r = resolved(s, now);
    if (s.kind === 'spotlight') {
      if (on) s.keys = [{ t: now, x: r.at.x, y: r.at.y }];
      else { s.at = r.at; delete s.keys; }
    } else if (s.kind === 'link') {
      s.track = !!on;
      s.pts.forEach(function (q, i) {
        var at = r.pts[i];
        q.x = at.x; q.y = at.y;
        if (on) q.keys = [{ t: now, x: at.x, y: at.y }]; else delete q.keys;
      });
    }
    touch(s);
    toast(on ? 'Tracking on — move to another frame and drag the mark onto the player'
             : 'Tracking off');
  }
  function keyTimes(s) {
    var seen = {}, out = [];
    var add = function (k) {
      var id2 = k.t.toFixed(3);
      if (!seen[id2]) { seen[id2] = 1; out.push(k.t); }
    };
    if (s.kind === 'spotlight') (s.keys || []).forEach(add);
    else (s.pts || []).forEach(function (q) { (q.keys || []).forEach(add); });
    return out.sort(function (a, b) { return a - b; });
  }
  function removeKeyAt(s, now) {
    var hit = false;
    var drop = function (keys) {
      if (!keys || keys.length < 2) return keys;
      var kept = keys.filter(function (k) { return Math.abs(k.t - now) >= 0.02; });
      if (kept.length !== keys.length && kept.length) { hit = true; return kept; }
      return keys;
    };
    if (s.kind === 'spotlight') s.keys = drop(s.keys);
    else s.pts.forEach(function (q) { q.keys = drop(q.keys); });
    if (hit) touch(s);
    return hit;
  }
  function freezeDraw(t) {
    holdAt(t);
    armTool('arrow', { freeze: 3 });
    toast('Frame held — drag to draw. The export stops here for 3 s. Backspace to leave.', true);
  }

  /* ---------------------------------------------------------------
     Calibration and measuring
     --------------------------------------------------------------- */
  function calOk(now) { return !!(cal && Math.abs(now - cal.t) <= CAL_SPAN); }
  function saveCal() {
    var s = loadStore(); s.byMatch = s.byMatch || {};
    var m = s.byMatch[matchKey()] = s.byMatch[matchKey()] || { v: 2, shapes: shapes, clips: [] };
    m.cal = cal;
    saveStore(s);
  }
  function openCalib() {
    if (!ctx) return;
    ctx.pause();
    ensureLayer();
    if (!layer) return;
    closeInsp();
    collect = null;
    calDraft = { t: ctx.video.currentTime, pts: [], L: cal ? cal.L : 105, W: cal ? cal.W : 68 };
    mode = { kind: 'calib' };
    adjust = null;
    armCursor();
    drawCalDraft();
    openInsp('calib', {});
    toast('Click four pitch markings you can name, then pick each one from the list');
  }
  function drawCalDraft() {
    if (!layer) return;
    layer.gDraft.textContent = '';
    if (!calDraft) return;
    var d = hOf() * 0.014, wd = Math.max(2, hOf() * 0.002);
    calDraft.pts.forEach(function (p, i) {
      var g = svgEl('g', {});
      g.appendChild(svgEl('path', {
        d: 'M' + (p.x - d) + ' ' + p.y + 'L' + (p.x + d) + ' ' + p.y + 'M' + p.x + ' ' + (p.y - d) + 'L' + p.x + ' ' + (p.y + d),
        stroke: '#2EC4FF', 'stroke-width': wd, fill: 'none' }));
      g.appendChild(plateNode(p.x + d * 2.6, p.y - d * 1.6, String(i + 1), '#062430', '#2EC4FF'));
      layer.gDraft.appendChild(g);
    });
  }
  function endCalib() {
    calDraft = null;
    if (mode && mode.kind === 'calib') mode = null;
    if (layer) layer.gDraft.textContent = '';
    armCursor();
  }
  function applyCalib() {
    var d = calDraft; if (!d) return;
    var marks = pitchMarks(d.L, d.W), used = {}, src = [], dst = [], i;
    for (i = 0; i < d.pts.length; i++) {
      var p = d.pts[i];
      if (p.lm === '' || p.lm == null) { toast('Pick which pitch marking point ' + (i + 1) + ' is'); return; }
      if (used[p.lm]) { toast('Two points are the same marking'); return; }
      used[p.lm] = 1;
      src.push({ x: p.x, y: p.y });
      dst.push({ x: marks[p.lm][1], y: marks[p.lm][2] });
    }
    if (src.length !== 4) { toast('Click four points on the picture first'); return; }
    var H = !collinear(src, hOf() * hOf() * 0.0004) && !collinear(dst, 1) ? homography(src, dst) : null;
    if (!H) { toast('Those four points do not fix the pitch. Choose points that are not in a line', true); return; }
    cal = { t: d.t, H: H, L: d.L, W: d.W, pts: d.pts };
    saveCal();
    endCalib();
    openInsp('measure', {});
    armMeasure(lastMeasure);
    toast('Pitch calibrated for this frame. Distances are approximate');
  }
  function measureValue(s) {
    var H = s.H; if (!H) return;
    if (s.sub === 'area') {
      var m = (s.pts || []).map(function (p) { return applyH(H, p); });
      s.metres = m.length > 2 && m.every(Boolean) ? polyArea(m) : null;
      return;
    }
    var a = applyH(H, s.from), b = applyH(H, s.to);
    if (!a || !b) { s.metres = null; return; }
    var dx = a.x - b.x, dy = a.y - b.y;
    s.metres = s.sub === 'width' ? Math.abs(dy)
             : s.sub === 'depth' ? Math.abs(dx)
             : Math.sqrt(dx * dx + dy * dy);
  }
  function armMeasure(sub) {
    lastMeasure = sub;
    mode = { kind: 'measure', sub: sub };
    adjust = null;
    ensureLayer();
    armCursor();
  }
  function startMeasure(sub, t) {
    if (!ctx) return;
    holdAt(t);
    lastMeasure = sub || lastMeasure;
    selectShape(null);
    if (!calOk(t != null ? t : ctx.video.currentTime)) {
      // a tool left armed by the last frame must not survive onto this one
      if (mode && mode.kind === 'measure') { mode = null; armCursor(); }
      if (cal) { openInsp('measure', {}); return; }
      openCalib();
      return;
    }
    openInsp('measure', {});
    armMeasure(lastMeasure);
    toast(lastMeasure === 'area' ? 'Click the corners of the area, then press Finish'
                                 : 'Drag between two points on the picture');
  }

  /* ---------------------------------------------------------------
     The inspector

     Every property of the thing being worked on, in one panel beside the picture.
     A child of the stage, so it can never cover the pitch and the event list.
     It takes its own events at the door: a press here must not reach the stage's
     onDown and put a spotlight on the frame behind it.
     --------------------------------------------------------------- */
  function uiStop(e) {
    if (menu) closeMenu();
    e.stopPropagation();
  }
  function fenceUi(n) {
    ['pointerdown', 'contextmenu', 'wheel', 'click', 'dblclick'].forEach(function (t) {
      n.addEventListener(t, uiStop);
    });
  }
  function openInsp(kind, data) {
    if (!ctx || !full || !ctx.stage) return;
    var node = insp ? insp.el : null;
    if (!node) {
      node = el('div', 'fmt-insp');
      fenceUi(node);
      ctx.stage.appendChild(node);
    }
    insp = Object.assign({ el: node, kind: kind }, data || {});
    renderInsp();
  }
  function closeInsp() {
    if (!insp) return;
    if (insp.el.parentNode) insp.el.parentNode.removeChild(insp.el);
    insp = null;
  }
  /* Below the lane, above the editor, never past the bottom of the stage. */
  function placeInsp() {
    if (!insp || !ctx || !ctx.stage) return;
    var top = 10, sr = ctx.stage.getBoundingClientRect();
    if (strip && strip.el) {
      var st = parseFloat(strip.el.style.top) || 0, sh = parseFloat(strip.el.style.height) || STRIP_H;
      top = st + sh + 8;
    }
    var bottom = editor && editor.el ? (editor.el.offsetHeight || 0) + 18 : 10;
    var room = sr.height - bottom;
    if (inspPos && sr.width) {
      var w = insp.el.offsetWidth || 296;
      insp.el.style.left = clamp(inspPos.x, 0, Math.max(0, sr.width - w)) + 'px';
      top = clamp(inspPos.y, 0, Math.max(0, room - 160));
    }
    insp.el.style.top = top + 'px';
    if (sr.height) insp.el.style.maxHeight = Math.max(160, room - top) + 'px';
  }
  function renderInsp() {
    if (!insp) return;
    var scroll = insp.el.scrollTop;
    empty(insp.el);
    insp.el.classList.toggle('wide', insp.kind === 'tag');
    insp.el.classList.toggle('peek', !!(editor && editor.peek));
    if (insp.kind === 'shape') inspShape();
    else if (insp.kind === 'measure') inspMeasure();
    else if (insp.kind === 'calib') inspCalib();
    else if (insp.kind === 'clip') inspClip();
    else if (insp.kind === 'tag') inspTag();
    if (insp) { placeInsp(); insp.el.scrollTop = scroll; }
  }

  /* ---- form parts ---- */
  function iHead(icon, title, sub, onClose) {
    var h = el('div', 'fmt-i-head');
    var box = el('span', 'fmt-i-tool'); box.appendChild(iconEl(icon));
    var col = el('div', 'fmt-i-title');
    col.appendChild(el('b', null, title));
    if (sub) col.appendChild(el('span', null, sub));
    var x = el('button', 'fmt-i-x'); x.type = 'button'; x.title = 'Close';
    x.appendChild(iconEl('close'));
    x.onclick = onClose;
    h.appendChild(box); h.appendChild(col); h.appendChild(x);
    insp.el.appendChild(h);
    h.addEventListener('pointerdown', inspGrab);
  }
  /* The panel can be dragged by its title: a pitch marking or a player under it
     still has to be clickable. Where it was put is remembered until full screen
     ends. Movement is heard on the box, for the same reason as the timeline: the
     pointer outruns the small thing that was pressed. */
  function inspGrab(e) {
    if (!insp || !ctx || !ctx.box || e.button) return;
    if (within(insp.el.querySelector('.fmt-i-x'), e.target)) return;
    var n = insp.el, box = ctx.box;
    var dx = e.clientX - n.offsetLeft, dy = e.clientY - n.offsetTop;
    var move = function (ev) {
      inspPos = { x: ev.clientX - dx, y: ev.clientY - dy };
      placeInsp();
    };
    var up = function () {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    e.preventDefault();
  }
  function iField(label, parent) {
    var f = el('div', 'fmt-i-f');
    f.appendChild(el('div', 'fmt-i-l', label));
    (parent || insp.el).appendChild(f);
    return f;
  }
  function iChips(f, opts, cur, on) {
    var row = el('div', 'fmt-chips');
    opts.forEach(function (o) {
      var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
      var b = el('button', 'fmt-chip' + (val === cur ? ' on' : ''), lab);
      b.type = 'button';
      b.onclick = function () { on(val); };
      row.appendChild(b);
    });
    f.appendChild(row);
    return row;
  }
  var SWATCHES = [['Red', ACCENT], ['White', HOME], ['Yellow', AWAY], ['Blue', '#2EC4FF'], ['Green', '#3DDC6A']];
  function iSwatches(f, cur, on) {
    var row = el('div', 'fmt-swatches');
    SWATCHES.forEach(function (c) {
      var b = el('button', 'fmt-swatch' + (c[1] === cur ? ' on' : ''));
      b.type = 'button'; b.title = c[0]; b.style.background = c[1];
      b.onclick = function () { on(c[1]); };
      row.appendChild(b);
    });
    f.appendChild(row);
  }
  function iToggle(f, label, val, on, hint, off) {
    var b = el('button', 'fmt-toggle' + (val ? ' on' : '') + (off ? ' off' : ''));
    b.type = 'button';
    var t = el('span', 'fmt-toggle-t');
    t.appendChild(el('b', null, label));
    if (hint) t.appendChild(el('em', null, hint));
    b.appendChild(t);
    b.appendChild(el('span', 'fmt-switch'));
    b.onclick = function () { if (!off) on(!val); };
    f.appendChild(b);
  }
  function iActions(sec, secFn, pri, priFn, priIcon) {
    var r = el('div', 'fmt-i-acts');
    if (sec) {
      var a = el('button', 'fmt-btn', sec); a.type = 'button'; a.onclick = secFn;
      r.appendChild(a);
    }
    var b = el('button', 'fmt-btn pri'); b.type = 'button';
    if (priIcon) b.appendChild(iconEl(priIcon));
    b.appendChild(el('span', null, pri));
    b.onclick = priFn;
    r.appendChild(b);
    insp.el.appendChild(r);
  }
  function iShowFreeze(s) {
    var showF = iField('Show on screen');
    iChips(showF, [[1, '1 s'], [2, '2 s'], [3, '3 s'], [5, '5 s'], [8, '8 s'], ['pin', '📌 Whole clip']],
      s.life === 'pinned' ? 'pin' : Math.round(s.out - s.in), function (v) {
        if (v === 'pin') { if (s.life !== 'pinned') togglePin(); }
        else {
          if (s.life === 'pinned') togglePin();
          setDur(v);
        }
        renderInsp();
      });
    var fr = iField('Freeze on export');
    iChips(fr, [[0, 'Off'], [2, '2 s'], [3, '3 s'], [4, '4 s'], [5, '5 s']], s.freeze || 0, function (v) {
      setFreeze(v); renderInsp();
    });
  }
  function iTrack(f, s) {
    var on = s.kind === 'spotlight' ? !!s.keys : !!s.track;
    iToggle(f, 'Track with keyframes', on, function (v) { setTrack(s, v); renderInsp(); },
      'Go to another frame and drag the mark onto the player. Film fills in the frames between.');
    if (!on) return;
    var times = keyTimes(s), now = ctx.video.currentTime;
    var row = el('div', 'fmt-keys');
    row.appendChild(el('span', 'fmt-keys-n', times.length + (times.length === 1 ? ' keyframe' : ' keyframes')));
    var go = function (dir) {
      var list = times.filter(function (t) { return dir < 0 ? t < now - 0.02 : t > now + 0.02; });
      if (!list.length) return;
      ctx.pause();
      ctx.seek(dir < 0 ? list[list.length - 1] : list[0]);
      renderInsp();
    };
    [['◀', 'Previous keyframe', function () { go(-1); }],
     ['▶', 'Next keyframe', function () { go(1); }],
     ['✕', 'Remove the keyframe on this frame', function () {
        if (!removeKeyAt(s, ctx.video.currentTime)) toast('No keyframe to remove on this frame');
        renderInsp();
      }]].forEach(function (c) {
      var b = el('button', 'fmt-chip', c[0]); b.type = 'button'; b.title = c[1]; b.onclick = c[2];
      row.appendChild(b);
    });
    f.appendChild(row);
  }

  /* ---- one drawing ---- */
  /* Enter in a one-line field means "that's it". Leaving the field also hands
     the keyboard back: filmKeys ignores every key while an input holds the focus. */
  function fieldDone(n) {
    n.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); n.blur(); }
    });
    return n;
  }
  function inspShape() {
    var s = shapeById(insp.id);
    if (!s) { closeInsp(); return; }
    s.style = s.style || {};
    var range = s.life === 'pinned' ? 'Whole clip' : clock(s.in) + ' → ' + clock(s.out);
    var done = function () {
      if (collect) finishCollect();
      selectShape(null);
    };
    if (s.kind === 'spotlight') {
      iHead('spotlight', 'Spotlight & track', range, done);
      var pf = iField('Label');
      var inp = el('input', 'fmt-input');
      inp.type = 'text'; inp.maxLength = 24; inp.placeholder = 'e.g. #6'; inp.value = s.label || '';
      inp.addEventListener('input', function () { s.label = inp.value; touch(s, true); persistSoon(); });
      pf.appendChild(fieldDone(inp));
      var who = cuePlayer(cueAt(s.t));
      if (who && s.label !== '#' + who) {
        var use = el('button', 'fmt-chip', 'Use #' + who + ' from the event');
        use.type = 'button';
        use.onclick = function () { s.label = '#' + who; s.showLabel = true; touch(s); renderInsp(); };
        pf.appendChild(use);
      }
      iToggle(pf, 'Name tag', s.showLabel !== false, function (v) { s.showLabel = v; touch(s); renderInsp(); });
      iTrack(iField('Follow the player'), s);
      iChips(iField('Style'), [['ring', 'Ring'], ['beam', 'Beam'], ['both', 'Ring + beam'], ['head', 'Arrow head'], ['circle', 'Circle']],
        s.look || 'circle', function (v) { s.look = v; touch(s); renderInsp(); });
      iSwatches(iField('Colour'), s.style.color, function (c) { s.style.color = c; touch(s); renderInsp(); });
      var sf = iField('Size');
      var rg = el('input', 'fmt-range');
      rg.type = 'range'; rg.min = 2; rg.max = 25; rg.step = 0.5;
      rg.value = String(s.r / hOf() * 100);
      rg.addEventListener('input', function () {
        s.r = clamp(parseFloat(rg.value) / 100 * hOf(), hOf() * RMIN, hOf() * RMAX);
        touch(s, true); persistSoon();
      });
      rg.addEventListener('change', function () { rg.blur(); });
      sf.appendChild(rg);
      iShowFreeze(s);
      iToggle(iField('Focus'), 'Dim everything else', dim, function (v) {
        dim = v; ensureLayer(); paint(ctx.video.currentTime, 0); renderInsp();
      });
    } else if (s.kind === 'link') {
      iHead('link', 'Link players', range + ' · ' + s.pts.length + ' players', done);
      var lf = iField('Players (in link order)');
      var row = el('div', 'fmt-chips');
      s.pts.forEach(function (q, i) {
        var b = el('button', 'fmt-num', String(i + 1));
        b.type = 'button'; b.title = 'Remove player ' + (i + 1);
        b.onclick = function () { s.pts.splice(i, 1); touch(s); renderInsp(); };
        row.appendChild(b);
      });
      if (collect && collect.id === s.id) row.appendChild(el('span', 'fmt-hint', '+ Click a player on the picture'));
      lf.appendChild(row);
      if (!collect) {
        var more = el('button', 'fmt-chip', '+ Add players'); more.type = 'button';
        more.onclick = function () { ctx.pause(); collect = { id: s.id }; armCursor(); renderInsp(); };
        lf.appendChild(more);
      }
      iChips(iField('Mode'), [['chain', 'Chain'], ['line', 'Defensive line'], ['shape', 'Shape']], s.sub, function (v) {
        s.sub = v; touch(s); renderInsp();
      });
      iSwatches(iField('Colour'), s.style.color, function (c) { s.style.color = c; touch(s); renderInsp(); });
      iChips(iField('Line'), [['solid', 'Solid'], ['dashed', 'Dashed'], ['arrows', 'Arrows']], s.lineStyle || 'solid', function (v) {
        s.lineStyle = v; touch(s); renderInsp();
      });
      var mf = iField('Measurements');
      var nowT = ctx.video.currentTime;
      iToggle(mf, 'Distances on each link', !!s.dist, function (v) {
        s.dist = v;
        if (v) { s.H = cal.H; s.calT = cal.t; s.units = units; }
        touch(s); renderInsp();
      }, calOk(nowT) || s.dist ? 'Shown within a second of the calibrated frame.' : 'Calibrate the pitch on this frame first.',
         !calOk(nowT) && !s.dist);
      if (!calOk(nowT) && !s.dist) {
        var cb = el('button', 'fmt-chip', 'Calibrate this frame'); cb.type = 'button';
        cb.onclick = function () { selectShape(null); openCalib(); };
        mf.appendChild(cb);
      }
      iTrack(iField('Follow the players'), s);
      iShowFreeze(s);
    } else {
      iHead('draw', toolName(s.kind), range, done);
      iSwatches(iField('Colour'), (s.style && s.style.color) || ACCENT, function (c) {
        s.style = s.style || {}; s.style.color = c; touch(s); renderInsp();
      });
      iShowFreeze(s);
    }
    if (collect && collect.id === s.id) {
      iActions('Delete', function () { collect = null; armCursor(); removeShape(s.id); },
               'Finish', function () { finishCollect(); }, 'check');
    } else {
      iActions('Delete', function () { removeShape(s.id); }, 'Done', done);
    }
  }

  /* ---- measuring ---- */
  function inspMeasure() {
    var now = ctx.video.currentTime, ok = calOk(now);
    iHead('measure', 'Measure', clock(now), function () {
      if (collect) finishCollect();
      mode = null; armCursor(); closeInsp();
    });
    var pf = iField('Pitch');
    if (ok) {
      pf.appendChild(el('div', 'fmt-cal ok', '✓ Calibrated from 4 pitch points on this frame'));
    } else {
      pf.appendChild(el('div', 'fmt-cal', cal
        ? 'Calibrated at ' + clock(cal.t) + '. If the camera has moved since, calibrate again.'
        : 'Not calibrated yet.'));
    }
    var row = el('div', 'fmt-chips');
    var redo = el('button', 'fmt-chip', ok ? 'Calibrate again' : 'Calibrate this frame');
    redo.type = 'button'; redo.onclick = openCalib;
    row.appendChild(redo);
    if (cal && !ok) {
      var same = el('button', 'fmt-chip', 'Camera hasn’t moved');
      same.type = 'button';
      same.onclick = function () {
        cal.t = ctx.video.currentTime; saveCal();
        openInsp('measure', {}); armMeasure(lastMeasure);
      };
      row.appendChild(same);
    }
    pf.appendChild(row);
    if (!ok) { iActions(null, null, 'Close', function () { mode = null; armCursor(); closeInsp(); }); return; }

    iChips(iField('What to measure'), [['distance', 'Distance'], ['width', 'Width'], ['depth', 'Depth'], ['area', 'Area']],
      lastMeasure, function (v) {
        if (collect) finishCollect();
        armMeasure(v); renderInsp();
        toast(v === 'area' ? 'Click the corners of the area, then press Finish' : 'Drag between two points on the picture');
      });
    iChips(iField('Units'), [['m', 'metres'], ['yd', 'yards']], units, function (v) {
      units = v;
      shapes.forEach(function (s) { if (s.kind === 'measure' || s.kind === 'link') { s.units = v; touch(s); } });
      renderInsp();
    });
    var here = liveAt(now).filter(function (s) { return s.kind === 'measure'; });
    var lf = iField('On this frame');
    if (!here.length) lf.appendChild(el('div', 'fmt-hint', 'Nothing measured yet.'));
    here.forEach(function (s) {
      var r = el('div', 'fmt-row');
      var name = { distance: 'Distance', width: 'Width', depth: 'Depth', area: 'Area' }[s.sub];
      r.appendChild(el('span', 'fmt-row-t', name));
      r.appendChild(el('b', 'fmt-row-v', s.metres == null ? '—'
        : s.sub === 'area' ? fmtArea(s.metres, s.units) : fmtLen(s.metres, s.units)));
      var x = el('button', 'fmt-i-x'); x.type = 'button'; x.title = 'Delete';
      x.appendChild(iconEl('trash'));
      x.onclick = function () { if (collect && collect.id === s.id) { collect = null; armCursor(); } removeShape(s.id); renderInsp(); };
      r.appendChild(x);
      lf.appendChild(r);
    });
    if (here.length) {
      var hold = here[0].freeze || 0;
      iChips(iField('Freeze on export'), [[0, 'Off'], [2, '2 s'], [3, '3 s'], [5, '5 s']], hold, function (v) {
        here.forEach(function (s) { s.freeze = v; touch(s); });
        renderInsp();
      });
    }
    if (collect) iActions(null, null, 'Finish area', function () { finishCollect(); renderInsp(); }, 'check');
    else iActions(null, null, 'Done', function () { mode = null; armCursor(); closeInsp(); });
  }
  function inspCalib() {
    var d = calDraft;
    if (!d) { closeInsp(); return; }
    var leave = function () { endCalib(); closeInsp(); };
    iHead('measure', 'Calibrate the pitch', clock(d.t) + ' · ' + d.pts.length + ' of 4', leave);
    insp.el.appendChild(el('div', 'fmt-hint', 'Click a pitch marking on the picture, then say which one it is. '
      + 'Spread the four points out, and do not put three in a line.'));
    var marks = pitchMarks(d.L, d.W);
    d.pts.forEach(function (p, i) {
      var f = iField('Point ' + (i + 1));
      var row = el('div', 'fmt-row');
      var sel = el('select', 'fmt-input');
      var first = el('option', null, 'Which marking is this?'); first.value = ''; sel.appendChild(first);
      marks.forEach(function (m, j) {
        var o = el('option', null, m[0]); o.value = String(j);
        if (String(p.lm) === String(j)) o.selected = true;
        sel.appendChild(o);
      });
      sel.value = p.lm == null ? '' : String(p.lm);
      sel.addEventListener('change', function () { p.lm = sel.value === '' ? '' : +sel.value; sel.blur(); });
      row.appendChild(sel);
      var x = el('button', 'fmt-i-x'); x.type = 'button'; x.title = 'Remove this point';
      x.appendChild(iconEl('trash'));
      x.onclick = function () { d.pts.splice(i, 1); drawCalDraft(); renderInsp(); };
      row.appendChild(x);
      f.appendChild(row);
    });
    var size = iField('Pitch size (metres)');
    var row2 = el('div', 'fmt-row');
    [['L', 'Length'], ['W', 'Width']].forEach(function (k) {
      var inp = el('input', 'fmt-input num');
      inp.type = 'number'; inp.min = 40; inp.max = 130; inp.value = d[k[0]]; inp.title = k[1];
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        if (v >= 30 && v <= 130) d[k[0]] = v; else inp.value = d[k[0]];
      });
      row2.appendChild(fieldDone(inp));
    });
    size.appendChild(row2);
    iActions('Cancel', leave, 'Apply', applyCalib, 'check');
  }

  /* ---------------------------------------------------------------
     The clip editor

     Everything it changes lives on clip.edit, and a clip without one is exactly
     the clip it always was. It is a child of the stage, so the event list and the
     pitch stay visible and clickable the whole time.
     --------------------------------------------------------------- */
  function clipWindow(t) {
    var c = cueAt(t), mid = c ? c.t : t;
    return { a: Math.max(ctx.win.start, mid - 6), b: Math.min(ctx.end(), mid + 6), cue: c };
  }
  function clipUnder(t) {
    var list = clips(), i;
    for (i = list.length - 1; i >= 0; i--) if (t >= list[i].in && t <= list[i].out) return list[i];
    return null;
  }
  function editAt(t, then) {
    if (!ctx) return;
    if (editor && t >= editor.clip.in && t <= editor.clip.out) { if (then) then(); return; }
    if (editor) closeEditor();
    var c = clipUnder(t);
    if (!c) {
      if (mark.in != null && t > mark.in + MIN_CLIP) c = saveClip(mark.in, t);
      else {
        var w = clipWindow(t);
        if (w.b - w.a < MIN_CLIP) { toast('Not enough of this half is left to make a clip'); return; }
        c = saveClip(w.a, w.b, clock(w.cue ? w.cue.t : t)
          + (w.cue && w.cue.rows && w.cue.rows[0] && w.cue.rows[0].event ? ' ' + w.cue.rows[0].event : ''));
      }
    }
    openEditor(c.id);
    if (editor && then) then();
  }
  function openEditor(cid) {
    if (!ctx || !full || !ctx.stage) return;
    var c = clips().filter(function (x) { return x.id === cid; })[0];
    if (!c) { toast('That clip is gone'); return; }
    if (c.in < ctx.win.start - 0.05 || c.out > ctx.end() + 0.05) {
      toast('That clip is in the other half. Switch half to edit it');
      return;
    }
    if (editor) closeEditor();
    if (!c.edit) c.edit = newEdit(c);
    selectShape(null);
    armTool(null);
    collect = null;
    closeInsp();
    var node = el('div', 'fmt-ed');
    fenceUi(node);
    ctx.stage.appendChild(node);
    var now = ctx.video.currentTime;
    if (now < c.in || now > c.out) ctx.seek(c.in);
    ctx.pause();
    var first = segAt(c.edit, ctx.video.currentTime) || c.edit.segs[0];
    editor = { el: node, clip: c, sel: { type: 'seg', id: first.id }, hist: [], x: null, ph: null };
    editT = null;
    beginPreview(c);
    renderEditor();
    openInsp('clip', {});
  }
  function closeEditor() {
    if (!editor) return;
    clearHold();
    if (editor.el.parentNode) editor.el.parentNode.removeChild(editor.el);
    editor = null;
    endPreview();
    if (insp && insp.kind === 'clip') closeInsp();
    if (layer && ctx) paint(ctx.video.currentTime, 0);
  }
  function snap() {
    editor.hist.push(JSON.stringify(editor.clip.edit));
    if (editor.hist.length > 60) editor.hist.shift();
  }
  function saveEdit() {
    var list = clips(), c = editor.clip, i;
    for (i = 0; i < list.length; i++) if (list[i].id === c.id) { list[i] = c; break; }
    setClips(list);
    if (panel) renderPanel();
  }
  function afterEdit(quiet) {
    syncClip(editor.clip);
    renderEditor();
    renderInsp();
    if (layer) paint(ctx.video.currentTime, 0);
    if (!quiet) saveEdit();
  }
  function undoEdit() {
    if (!editor.hist.length) { toast('Nothing to undo'); return; }
    editor.clip.edit = JSON.parse(editor.hist.pop());
    var e = editor.clip.edit;
    if (!segById(e, editor.sel.id)) editor.sel = { type: 'seg', id: e.segs[0].id };
    afterEdit();
    toast('Undone');
  }
  function segById(e, sid) {
    for (var i = 0; i < e.segs.length; i++) if (e.segs[i].id === sid) return e.segs[i];
    return null;
  }
  function selSeg() {
    var e = editor.clip.edit, s = editor.sel.type === 'seg' ? segById(e, editor.sel.id) : null;
    return s || segAt(e, ctx.video.currentTime) || e.segs[0];
  }
  function editSplit() {
    var e = editor.clip.edit, t = ctx.video.currentTime;
    snap();
    var n = splitAt(e, t);
    if (!n) { editor.hist.pop(); toast('Move the playhead inside a segment, away from its ends'); return; }
    editor.sel = { type: 'seg', id: n.id };
    afterEdit();
    toast('Split at ' + clock(t));
  }
  function editDelete() {
    var e = editor.clip.edit, s = editor.sel;
    if (s.type === 'text') {
      snap();
      e.texts = e.texts.filter(function (x) { return x.id !== s.id; });
      editor.sel = { type: 'seg', id: e.segs[0].id };
    } else if (s.type === 'freeze') {
      snap();
      e.freezes = e.freezes.filter(function (x) { return x.id !== s.id; });
      editor.sel = { type: 'seg', id: e.segs[0].id };
    } else {
      snap();
      if (!dropSeg(e, s.id)) { editor.hist.pop(); toast('A clip needs at least one segment'); return; }
      editor.sel = { type: 'seg', id: e.segs[0].id };
    }
    afterEdit();
  }
  function editFreeze() {
    var e = editor.clip.edit, t = ctx.video.currentTime;
    if (!segAt(e, t)) { toast('Move the playhead onto the clip first'); return; }
    snap();
    var f = { id: id(), t: t, hold: 3 };
    e.freezes.push(f);
    e.freezes.sort(function (a, b) { return a.t - b.t; });
    editor.sel = { type: 'freeze', id: f.id };
    afterEdit();
    toast('Freeze 3 s at ' + clock(t));
  }
  function editText() {
    var e = editor.clip.edit, t = ctx.video.currentTime, c = editor.clip;
    if (t < c.in || t >= c.out) t = c.in;
    snap();
    var x = { id: id(), a: t, b: Math.min(c.out, t + 3), text: 'Caption', pos: 'low', color: '#FFFFFF', rev: 0 };
    e.texts.push(x);
    editor.sel = { type: 'text', id: x.id };
    afterEdit();
    var inp = insp && insp.textEl;
    if (inp && inp.focus) { inp.focus(); if (inp.select) inp.select(); }
  }
  /* Speed is about the stretch being watched, so it picks the segment under the
     playhead and not whichever one was last clicked. */
  function editSpeed() {
    var e = editor.clip.edit, s = segAt(e, ctx.video.currentTime) || selSeg();
    editor.sel = { type: 'seg', id: s.id };
    renderEditor(); renderInsp();
    if (insp && insp.speedEl && insp.speedEl.scrollIntoView) insp.speedEl.scrollIntoView({ block: 'nearest' });
  }
  /* The panels sit on the picture, and a caption along the bottom sits under
     them. Preview folds them away and plays the clip from the top as the file
     will come out; the end of the clip, or pressing it again, brings them back. */
  function editPeek(on) {
    if (!editor) return;
    editor.peek = on == null ? !editor.peek : !!on;
    editor.el.classList.toggle('peek', editor.peek);
    if (insp) insp.el.classList.toggle('peek', editor.peek);
    var b = editor.peekBtn;
    if (b) b.classList.toggle('on', editor.peek);
    if (editor.peek) {
      editT = null;
      ctx.seek(editor.clip.in);
      ctx.play();
    } else ctx.pause();
  }
  function editMark(side) {
    var e = editor.clip.edit, t = ctx.video.currentTime;
    var s = side === 'a' ? e.segs[0] : e.segs[e.segs.length - 1];
    snap();
    trimSeg(e, s.id, side, t, ctx.win.start, ctx.end());
    afterEdit();
  }

  /* ---- drawing it ---- */
  function edRange() {
    var c = editor.clip, span = c.out - c.in, pad = Math.max(1, span * 0.08);
    return { a: Math.max(ctx.win.start, c.in - pad), b: Math.min(ctx.end(), c.out + pad) };
  }
  function edPct(t, r) { return (t - r.a) / Math.max(0.001, r.b - r.a) * 100; }
  function edTool(bar, icon, label, keyName, fn, on) {
    var b = el('button', 'fmt-ed-tool' + (on ? ' on' : ''));
    b.type = 'button'; b.title = label + (keyName ? ' (' + keyName + ')' : '');
    b.appendChild(iconEl(icon));
    b.appendChild(el('span', null, label));
    if (keyName) b.appendChild(el('kbd', 'fmt-ed-k', keyName));
    b.onclick = fn;
    bar.appendChild(b);
    return b;
  }
  /* Pointer movement is listened for on the box, not on the bar being dragged:
     every move rebuilds the timeline, and the element the press landed on is
     gone a frame later. Released on pointerup, whatever happened in between. */
  function edDrag(onMove, onEnd) {
    if (!ctx || !ctx.box) return;
    var box = ctx.box;
    var move = function (e) { if (editor) onMove(edTime(e.clientX)); };
    var up = function () {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      edDragEnd = null;
      if (editor && onEnd) onEnd();
    };
    edDragEnd = up;
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  }
  function edTime(clientX) {
    var r = edRange(), b = editor.x ? editor.x.getBoundingClientRect() : null;
    if (!b || !b.width) return r.a;
    return r.a + clamp((clientX - b.left) / b.width, 0, 1) * (r.b - r.a);
  }
  function edBar(track, a, b, r, cls, label, sel) {
    var n = el('div', 'fmt-ed-bar ' + cls + (sel ? ' on' : ''));
    n.style.left = edPct(a, r) + '%';
    n.style.width = Math.max(0.4, edPct(b, r) - edPct(a, r)) + '%';
    if (label) n.appendChild(el('span', 'fmt-ed-lb', label));
    track.appendChild(n);
    return n;
  }
  function edHandle(bar, side, onDown) {
    var h = el('span', 'fmt-ed-h ' + side);
    h.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (menu) closeMenu();
      onDown();
    });
    bar.appendChild(h);
  }
  function renderEditor() {
    if (!editor) return;
    var ed = editor, c = ed.clip, e = c.edit, r = edRange(), node = ed.el;
    empty(node);
    node.classList.toggle('peek', !!ed.peek);

    var bar = el('div', 'fmt-ed-tools');
    edTool(bar, 'split', 'Split', 'X', editSplit);
    edTool(bar, 'trash', 'Delete', 'Del', editDelete);
    edTool(bar, 'speed', 'Speed', 'V', editSpeed, ed.sel.type === 'seg' && segById(e, ed.sel.id) && segById(e, ed.sel.id).speed !== 1);
    edTool(bar, 'freeze', 'Freeze', 'Q', editFreeze);
    edTool(bar, 'text', 'Text', 'Y', editText);
    edTool(bar, 'transition', 'Transition', '', function () {
      var s = selSeg(); snap();
      s.trans = s.trans === 'fade' ? 'cut' : 'fade';
      ed.sel = { type: 'seg', id: s.id };
      afterEdit();
      toast(s.trans === 'fade' ? 'Fade into this segment' : 'Straight cut into this segment');
    }, ed.sel.type === 'seg' && segById(e, ed.sel.id) && segById(e, ed.sel.id).trans === 'fade');
    edTool(bar, 'undo', 'Undo', 'U', undoEdit);
    ed.peekBtn = edTool(bar, 'play', 'Preview', 'P', function () { editPeek(); }, !!ed.peek);
    bar.appendChild(el('span', 'fmt-ed-sum', clock(c.in) + ' → ' + clock(c.out) + ' · '
      + planOf(c.in, c.out, e, shapes).total.toFixed(1) + ' s out'));
    var x = el('button', 'fmt-i-x'); x.type = 'button'; x.title = 'Close the editor';
    x.appendChild(iconEl('close'));
    x.onclick = function () { closeEditor(); };
    bar.appendChild(x);
    node.appendChild(bar);

    var body = el('div', 'fmt-ed-body');
    var rows = {};
    ['', 'Text', 'Drawings', 'Video', 'Speed', 'Audio'].forEach(function (n) {
      var row = el('div', 'fmt-ed-row' + (n ? '' : ' ruler'));
      row.appendChild(el('span', 'fmt-ed-name', n));
      var tr = el('div', 'fmt-ed-tr');
      row.appendChild(tr);
      body.appendChild(row);
      rows[n] = tr;
    });
    ed.x = rows[''];

    // the ruler: a click or a drag anywhere on it is the playhead
    var span = r.b - r.a, step = [1, 2, 5, 10, 15, 30, 60, 120, 300].filter(function (q) { return span / q <= 10; })[0] || 600;
    for (var t = Math.ceil(r.a / step) * step; t <= r.b; t += step) {
      var tick = el('span', 'fmt-ed-tick', clock(t));
      tick.style.left = edPct(t, r) + '%';
      rows[''].appendChild(tick);
    }
    rows[''].addEventListener('pointerdown', function (ev) {
      ctx.pause();
      ctx.seek(edTime(ev.clientX));
      edDrag(function (tt) { ctx.seek(tt); });
    });

    // text
    e.texts.forEach(function (tx) {
      var n = edBar(rows.Text, tx.a, tx.b, r, 'text', 'T  ' + tx.text, ed.sel.type === 'text' && ed.sel.id === tx.id);
      n.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        ed.sel = { type: 'text', id: tx.id };
        var from = edTime(ev.clientX), a0 = tx.a, b0 = tx.b, moved = false;
        snap();
        renderEditor(); renderInsp();
        edDrag(function (tt) {
          var d = tt - from;
          d = clamp(d, c.in - a0, c.out - b0);
          if (Math.abs(d) > 0.01) moved = true;
          tx.a = a0 + d; tx.b = b0 + d; tx.rev = (tx.rev || 0) + 1;
          afterEdit(true);
        }, function () { if (moved) saveEdit(); else ed.hist.pop(); });
      });
      if (ed.sel.type === 'text' && ed.sel.id === tx.id) {
        ['a', 'b'].forEach(function (side) {
          edHandle(n, side, function () {
            snap();
            edDrag(function (tt) {
              if (side === 'a') tx.a = clamp(tt, c.in, tx.b - MIN_SEG);
              else tx.b = clamp(tt, tx.a + MIN_SEG, c.out);
              tx.rev = (tx.rev || 0) + 1;
              afterEdit(true);
            }, saveEdit);
          });
        });
      }
    });

    // drawings: read-only here, and a click goes to the frame the mark is on
    shapes.forEach(function (s) {
      if (s.life === 'pinned' || s.out < r.a || s.in > r.b) return;
      var n = edBar(rows.Drawings, Math.max(s.in, r.a), Math.min(s.out, r.b), r, 'draw', toolName(s.kind));
      n.style.background = (s.style && s.style.color) || ACCENT;
      n.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        ctx.pause(); ctx.seek(s.t);
      });
    });

    // video + speed: one bar per kept segment
    e.segs.forEach(function (s, i) {
      var sel = ed.sel.type === 'seg' && ed.sel.id === s.id;
      var v = edBar(rows.Video, s.a, s.b, r, 'vid', String.fromCharCode(65 + (i % 26)) + ' · '
        + (s.b - s.a).toFixed(1) + ' s' + (s.trans === 'fade' ? ' · fade' : ''), sel);
      v.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        ed.sel = { type: 'seg', id: s.id };
        renderEditor(); renderInsp();
      });
      ['a', 'b'].forEach(function (side) {
        edHandle(v, side, function () {
          ed.sel = { type: 'seg', id: s.id };
          snap();
          edDrag(function (tt) {
            trimSeg(e, s.id, side, tt, ctx.win.start, ctx.end());
            afterEdit(true);
          }, saveEdit);
          renderInsp();
        });
      });
      var sp = edBar(rows.Speed, s.a, s.b, r, 'spd' + (s.speed !== 1 ? ' fast' : ''), s.speed + '×', sel);
      sp.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        ed.sel = { type: 'seg', id: s.id };
        renderEditor(); renderInsp();
      });
    });
    e.freezes.forEach(function (f) {
      var m = el('button', 'fmt-ed-fz' + (ed.sel.type === 'freeze' && ed.sel.id === f.id ? ' on' : ''), '❄ ' + f.hold + ' s');
      m.type = 'button';
      m.style.left = edPct(f.t, r) + '%';
      m.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        ed.sel = { type: 'freeze', id: f.id };
        ctx.pause(); ctx.seek(f.t);
        renderEditor(); renderInsp();
      });
      rows.Video.appendChild(m);
    });

    // audio
    var au = edBar(rows.Audio, c.in, c.out, r, 'aud', 'Commentary · ' + (e.mute ? 'muted' : 'on'));
    au.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      snap(); e.mute = !e.mute;
      ctx.video.muted = e.mute || previewMuted === true;
      afterEdit();
    });

    // dims the stretch outside the clip, and the playhead over all of it
    var over = el('div', 'fmt-ed-over');
    var dimL = el('div', 'fmt-ed-out'); dimL.style.left = '0'; dimL.style.width = edPct(c.in, r) + '%';
    var dimR = el('div', 'fmt-ed-out'); dimR.style.left = edPct(c.out, r) + '%'; dimR.style.right = '0';
    var ph = el('div', 'fmt-ed-ph');
    ph.style.left = edPct(ctx.video.currentTime, r) + '%';
    over.appendChild(dimL); over.appendChild(dimR); over.appendChild(ph);
    body.appendChild(over);
    ed.ph = ph;
    node.appendChild(body);
    placeInsp();
  }
  function editorCursor(now) {
    if (editor && editor.ph) editor.ph.style.left = edPct(now, edRange()) + '%';
  }

  /* ---- the clip's inspector ---- */
  function inspClip() {
    if (!editor) { closeInsp(); return; }
    var ed = editor, c = ed.clip, e = c.edit, sel = ed.sel;
    var s = sel.type === 'seg' ? segById(e, sel.id) : null;
    if (!s && sel.type === 'seg') s = e.segs[0];
    var n = e.segs.indexOf(s);
    iHead('clip', s ? 'Clip · ' + String.fromCharCode(65 + (Math.max(0, n) % 26)) : 'Clip',
      clock(c.in) + ' → ' + clock(c.out), function () { closeEditor(); });
    var nf = iField('Name');
    var nm = el('input', 'fmt-input'); nm.type = 'text'; nm.maxLength = 80; nm.value = c.title || '';
    nm.addEventListener('change', function () { c.title = nm.value.trim() || c.title; saveEdit(); });
    nf.appendChild(fieldDone(nm));

    if (sel.type === 'text') {
      var tx = e.texts.filter(function (x) { return x.id === sel.id; })[0];
      if (tx) {
        var tf = iField('Caption  ·  ' + clock(tx.a) + ' → ' + clock(tx.b));
        var ti = el('input', 'fmt-input'); ti.type = 'text'; ti.maxLength = 80; ti.value = tx.text;
        ti.addEventListener('input', function () {
          tx.text = ti.value; tx.rev = (tx.rev || 0) + 1;
          if (layer) paint(ctx.video.currentTime, 0);
          persistEditSoon();
        });
        ti.addEventListener('change', function () { renderEditor(); });
        tf.appendChild(fieldDone(ti));
        insp.textEl = ti;
        iChips(iField('Position'), [['top', 'Top'], ['mid', 'Middle'], ['low', 'Bottom']], tx.pos || 'low', function (v) {
          snap(); tx.pos = v; tx.rev = (tx.rev || 0) + 1; afterEdit();
        });
        iSwatches(iField('Colour'), tx.color || '#FFFFFF', function (col) {
          snap(); tx.color = col; tx.rev = (tx.rev || 0) + 1; afterEdit();
        });
      }
    } else if (sel.type === 'freeze') {
      var fz = e.freezes.filter(function (x) { return x.id === sel.id; })[0];
      if (fz) {
        iChips(iField('Freeze at ' + clock(fz.t) + ' for'), [[2, '2 s'], [3, '3 s'], [4, '4 s'], [5, '5 s'], [8, '8 s']], fz.hold, function (v) {
          snap(); fz.hold = v; afterEdit();
        });
      }
    } else if (s) {
      var io = iField('Segment  ·  [ and ] set the clip ends');
      var row = el('div', 'fmt-chips');
      [['Start at playhead', 'a'], ['End at playhead', 'b']].forEach(function (k) {
        var b = el('button', 'fmt-chip', k[0]); b.type = 'button';
        b.onclick = function () {
          snap(); trimSeg(e, s.id, k[1], ctx.video.currentTime, ctx.win.start, ctx.end()); afterEdit();
        };
        row.appendChild(b);
      });
      io.appendChild(el('div', 'fmt-row-t', clock(s.a) + ' → ' + clock(s.b) + ' · ' + (s.b - s.a).toFixed(1) + ' s'));
      io.appendChild(row);
      var spF = iField('Speed for this segment');
      insp.speedEl = spF;
      iChips(spF, [[0.25, '0.25×'], [0.5, '0.5×'], [1, '1×'], [1.5, '1.5×'], [2, '2×']], s.speed, function (v) {
        snap(); s.speed = v; afterEdit();
      });
      iChips(iField('Transition into this segment'), [['cut', 'Cut'], ['fade', 'Fade']], s.trans || 'cut', function (v) {
        snap(); s.trans = v; afterEdit();
      });
    }
    var ff = iField('Freeze frames');
    if (!e.freezes.length) ff.appendChild(el('div', 'fmt-hint', 'None. Q freezes the frame under the playhead.'));
    e.freezes.forEach(function (f) {
      var r = el('div', 'fmt-row');
      r.appendChild(el('span', 'fmt-row-t', clock(f.t) + ' · ' + f.hold + ' s'));
      var x = el('button', 'fmt-i-x'); x.type = 'button'; x.title = 'Remove this freeze';
      x.appendChild(iconEl('trash'));
      x.onclick = function () {
        snap();
        e.freezes = e.freezes.filter(function (q) { return q.id !== f.id; });
        if (ed.sel.type === 'freeze' && ed.sel.id === f.id) ed.sel = { type: 'seg', id: e.segs[0].id };
        afterEdit();
      };
      r.appendChild(x);
      ff.appendChild(r);
    });
    var af = iField('Audio');
    iToggle(af, 'Mute commentary', !!e.mute, function (v) {
      snap(); e.mute = v;
      ctx.video.muted = v || previewMuted === true;
      afterEdit();
    });
    iActions('Add to playlist', function () { openTag(c.in, { a: c.in, b: c.out, code: null }); },
             'Export MP4', function () { exportClip(c.in, c.out, c.title, e); }, 'download');
  }
  var editSave = 0;
  function persistEditSoon() {
    clearTimeout(editSave);
    editSave = setTimeout(function () { if (editor) saveEdit(); }, 300);
  }

  /* ---- playing an edit ----

     Space in the editor plays the clip as the file will come out: the speed of
     each segment, the holds, the gaps cut out, the fades. It is checked once per
     frame Film paints, and the rate and the mute go back afterwards. */
  function beginPreview(c) {
    if (!ctx) return;
    if (previewRate == null) {
      previewRate = ctx.video.playbackRate || 1;
      previewMuted = !!ctx.video.muted;
    }
    if (c && c.edit && c.edit.mute) ctx.video.muted = true;
  }
  function endPreview() {
    clearHold();
    setFade(0);
    if (previewRate == null) return;
    if (ctx) { ctx.video.playbackRate = previewRate; ctx.video.muted = !!previewMuted; }
    previewRate = null; previewMuted = null; editT = null;
  }
  function clearHold() {
    if (hold) { clearTimeout(hold.timer); hold = null; }
  }
  function setFade(a) {
    if (!a) {
      if (fadeEl) fadeEl.style.opacity = '0';
      return;
    }
    if (!fadeEl || !fadeEl.parentNode) {
      if (!ctx || !ctx.stage) return;
      fadeEl = el('div', 'fmt-fade');
      ctx.stage.appendChild(fadeEl);
    }
    fadeEl.style.opacity = String(a);
  }
  function runEdit(now) {
    var c = editor ? editor.clip : (play && play.clip), e = c && c.edit, v = ctx.video;
    if (!e) return;
    var prev = editT;
    editT = now;
    if (hold && !v.paused) clearHold();            // the analyst pressed play during a hold
    if (v.paused) { setFade(fadeAlpha(e.segs, now)); return; }
    var s = segAt(e, now);
    if (!s) {
      var next = e.segs.filter(function (q) { return q.a > now; })[0];
      if (now >= c.out - 0.001) {
        if (prev != null && prev < c.out) {
          ctx.pause(); ctx.seek(c.out);
          if (editor && editor.peek) editPeek(false);
        }
        else if (v.playbackRate !== 1) v.playbackRate = 1;
      } else if (next && now >= c.in) ctx.seek(next.a);
      else if (v.playbackRate !== 1) v.playbackRate = 1;
      setFade(0);
      return;
    }
    if (v.playbackRate !== s.speed) v.playbackRate = s.speed;
    setFade(fadeAlpha(e.segs, now));
    if (prev != null && now > prev && now - prev < 1) {
      for (var i = 0; i < e.freezes.length; i++) {
        var f = e.freezes[i];
        if (f.t > prev && f.t <= now) {
          ctx.pause();
          hold = { timer: setTimeout(function () { hold = null; if (ctx) ctx.play(); }, f.hold * 1000) };
          return;
        }
      }
    }
  }

  /* ---------------------------------------------------------------
     Tags and playlists

     Saying something about a stretch of the match. This is words in a table,
     through the channel's own data layer, and it has nothing to do with the
     video: the promise at the top of this file is about rendered clips, and it
     still holds to the byte. Nothing here runs for a reader with no channel.
     --------------------------------------------------------------- */
  var CODES = [['Press trigger', '#E0122B'], ['Counter-press', '#F2742B'], ['Build-up', '#2E7CF6'],
               ['Transition', '#8E5CF7'], ['Set piece', '#14B8A6'], ['Def. shape', '#2FB35A'],
               ['Chance', '#E0A100'], ['Mistake', '#6C6164']];
  function store() { return window.HNA && window.HNA.film; }
  function canTag() {
    return !!(scope && scope.clubId && scope.matchUuid && scope.userId && scope.role && store());
  }
  function canShare() { return !!(scope && (scope.role === 'admin' || scope.role === 'analyst')); }
  function codeList() {
    var all = CODES.map(function (c) { return { name: c[0], color: c[1] }; });
    return all.concat((tagData && tagData.codes) || []);
  }
  function tagList() { return (tagData && tagData.tags) || []; }
  function loadTags() {
    if (!canTag()) return Promise.resolve(null);
    if (tagLoad) return tagLoad;
    tagLoad = store().list(scope.clubId, scope.matchUuid).then(function (d) {
      tagLoad = null;
      tagFail = null;
      tagData = d;
      if (ctx) renderStrip();
      if (panel) renderPanel();
      if (insp && insp.kind === 'tag') renderInsp();
      return d;
    }, function (e) {
      /* Quiet on purpose: this runs on entering full screen, usually with a room
         watching, and most people there never touch a tag. openTag() is where the
         failure is said, to the one person who has just asked for tags. */
      tagLoad = null;
      tagFail = (e && e.message) || 'network error';
      tagData = tagData || { tags: [], playlists: [], codes: [] };
      if (ctx) renderStrip();
      return null;
    });
    return tagLoad;
  }
  function needChannel() {
    toast('Tags and playlists need you signed in to this channel', true);
  }
  function openTag(t, preset) {
    if (!ctx) return;
    if (!canTag()) { needChannel(); return; }
    var p = preset || {}, w = clipWindow(t);
    selectShape(null);
    armTool(null);
    var form = {
      id: p.id || null,
      a: p.a != null ? p.a : w.a, b: p.b != null ? p.b : w.b,
      code: p.code !== undefined ? p.code : null, color: p.color || null,
      team: p.team || null, outcome: p.outcome || null, zone: p.zone || null,
      players: p.players != null ? p.players : (w.cue && cuePlayer(w.cue) ? '#' + cuePlayer(w.cue) : ''),
      note: p.note || '', playlistId: p.playlistId || '', visibility: p.visibility || 'private',
      newPlaylist: null, newCode: null, saving: false
    };
    openInsp('tag', { form: form, t: t });
    if (tagFail) toast('Tags could not be loaded: ' + tagFail, true);
    if (!tagData || tagFail) {
      loadTags().then(function () {
        if (tagFail) toast('Tags could not be loaded: ' + tagFail, true);
        else if (insp && insp.kind === 'tag') toast('');
      });
    }
  }
  function closeTag() {
    closeInsp();
    if (editor) openInsp('clip', {});
  }
  function tagStep(which, d) {
    var f = insp.form, lo = ctx.win.start, hi = ctx.end();
    if (which === 'a') f.a = clamp(f.a + d, lo, f.b - MIN_CLIP);
    else f.b = clamp(f.b + d, f.a + MIN_CLIP, hi);
    renderInsp();
  }
  function pickCode(i) {
    var list = codeList(), c = list[i];
    if (!c || !insp || insp.kind !== 'tag') return false;
    var f = insp.form;
    if (f.code === c.name) { f.code = null; f.color = null; }
    else { f.code = c.name; f.color = c.color; }
    renderInsp();
    return true;
  }
  function saveTagForm() {
    var f = insp && insp.form;
    if (!f || f.saving) return;
    if (!f.code && !f.playlistId && f.newPlaylist == null) {
      toast('Pick a code, or a playlist to file this under'); return;
    }
    if (f.visibility === 'channel' && !canShare()) f.visibility = 'private';
    var name = f.newPlaylist != null ? f.newPlaylist.trim() : '';
    if (f.newPlaylist != null && !name) { toast('Give the new playlist a name'); return; }
    f.saving = true;
    var done = name
      ? store().addPlaylist(scope.clubId, name).then(function (pl) {
          tagData = tagData || { tags: [], playlists: [], codes: [] };
          tagData.playlists.push(pl);
          f.playlistId = pl.id; f.newPlaylist = null;
          return pl.id;
        })
      : Promise.resolve(f.playlistId || null);
    done.then(function (plId) {
      return store().saveTag(scope.clubId, scope.matchUuid, {
        id: f.id, tIn: f.a, tOut: f.b, code: f.code, color: f.color, team: f.team,
        outcome: f.outcome, zone: f.zone, players: f.players.trim() || null,
        note: f.note.trim() || null, playlistId: plId || null, visibility: f.visibility
      });
    }).then(function (tag) {
      tagData = tagData || { tags: [], playlists: [], codes: [] };
      if (!insp || insp.form !== f) return loadTags();
      var list = tagData.tags.filter(function (x) { return x.id !== tag.id; });
      list.push(tag);
      list.sort(function (x, y) { return x.tIn - y.tIn; });
      tagData.tags = list;
      closeTag();
      renderStrip();
      if (panel) renderPanel();
      toast('Tag saved');
    }, function (e) {
      f.saving = false;
      toast('Could not save the tag: ' + ((e && e.message) || 'network error'), true);
      if (insp && insp.form === f) renderInsp();
    });
  }
  function removeTag(tag) {
    store().removeTag(tag.id).then(function () {
      tagData.tags = tagData.tags.filter(function (x) { return x.id !== tag.id; });
      renderStrip();
      if (panel) renderPanel();
      toast('Tag deleted');
    }, function (e) {
      toast('Could not delete the tag: ' + ((e && e.message) || 'network error'), true);
    });
  }
  function fileToPlaylist(t, pl) {
    if (!canTag()) { needChannel(); return; }
    var c = editor ? editor.clip : clipUnder(t), w = c ? { a: c.in, b: c.out } : clipWindow(t);
    store().saveTag(scope.clubId, scope.matchUuid, {
      tIn: w.a, tOut: w.b, code: null, color: null, playlistId: pl.id, visibility: 'private'
    }).then(function (tag) {
      tagData = tagData || { tags: [], playlists: [], codes: [] };
      tagData.tags.push(tag);
      tagData.tags.sort(function (x, y) { return x.tIn - y.tIn; });
      renderStrip();
      if (panel) renderPanel();
      toast('Added to ' + pl.name);
    }, function (e) {
      toast('Could not add it: ' + ((e && e.message) || 'network error'), true);
    });
  }
  function playlistItems(t) {
    if (!canTag()) return [{ label: 'Sign in to this channel to use playlists', run: needChannel }];
    var list = (tagData && tagData.playlists) || [];
    var out = list.map(function (pl) {
      return { label: pl.name, run: function () { fileToPlaylist(t, pl); } };
    });
    if (!tagData) out.push({ label: 'Loading…', run: function () { loadTags(); } });
    if (out.length) out.push({ sep: true });
    out.push({ label: 'New playlist…', icon: 'plus', run: function () {
      openTag(t, { code: null });
      if (insp && insp.form) { insp.form.newPlaylist = ''; renderInsp(); }
    } });
    return out;
  }
  function inspTag() {
    var f = insp.form;
    iHead('tag', f.id ? 'Edit tag' : 'Tag this moment',
      clock(f.a) + ' → ' + clock(f.b) + ' · ' + Math.round(f.b - f.a) + ' s', closeTag);
    var cols = el('div', 'fmt-i-cols');
    var L = el('div', 'fmt-i-col'), R = el('div', 'fmt-i-col');
    cols.appendChild(L); cols.appendChild(R);
    insp.el.appendChild(cols);

    var wf = iField('Window', L);
    var wr = el('div', 'fmt-stepper');
    [['a', f.a], ['b', f.b]].forEach(function (k) {
      var box = el('div', 'fmt-step');
      var m = el('button', null, '−'); m.type = 'button'; m.title = 'One second earlier';
      m.onclick = function () { tagStep(k[0], -1); };
      var p = el('button', null, '+'); p.type = 'button'; p.title = 'One second later';
      p.onclick = function () { tagStep(k[0], 1); };
      box.appendChild(m); box.appendChild(el('span', null, clock(k[1]))); box.appendChild(p);
      wr.appendChild(box);
    });
    wf.appendChild(wr);
    var wc = [['event', 'Event ±6 s']];
    if (mark.in != null) wc.push(['mark', 'From the mark']);
    if (editor) wc.push(['clip', 'This clip']);
    iChips(wf, wc, null, function (v) {
      if (v === 'event') { var w = clipWindow(insp.t); f.a = w.a; f.b = w.b; }
      else if (v === 'mark') { f.a = mark.in; f.b = Math.max(ctx.video.currentTime, mark.in + MIN_CLIP); }
      else if (v === 'clip' && editor) { f.a = editor.clip.in; f.b = editor.clip.out; }
      renderInsp();
    });

    var cf = iField('Code  (press 1–9)', L);
    var grid = el('div', 'fmt-codes');
    codeList().forEach(function (c, i) {
      var b = el('button', 'fmt-code' + (f.code === c.name ? ' on' : ''));
      b.type = 'button';
      b.style.borderColor = c.color;
      b.style.background = f.code === c.name ? c.color : 'rgba(255,255,255,.04)';
      if (i < 9) b.appendChild(el('kbd', null, String(i + 1)));
      b.appendChild(el('span', null, c.name));
      b.onclick = function () { pickCode(i); };
      grid.appendChild(b);
    });
    cf.appendChild(grid);
    if (f.newCode != null) {
      var nr = el('div', 'fmt-row');
      var ni = el('input', 'fmt-input'); ni.type = 'text'; ni.maxLength = 40; ni.placeholder = 'Name of the code';
      ni.value = f.newCode;
      ni.addEventListener('input', function () { f.newCode = ni.value; });
      fieldDone(ni);
      var ns = el('button', 'fmt-chip', 'Add'); ns.type = 'button';
      ns.onclick = function () {
        var name = (f.newCode || '').trim();
        if (!name) { toast('Give the code a name'); return; }
        store().addCode(scope.clubId, name).then(function (code) {
          tagData = tagData || { tags: [], playlists: [], codes: [] };
          tagData.codes = (tagData.codes || []).concat([code]);
          f.code = code.name; f.color = code.color; f.newCode = null;
          renderInsp();
        }, function (e) { toast('Could not add the code: ' + ((e && e.message) || 'network error'), true); });
      };
      nr.appendChild(ni); nr.appendChild(ns);
      cf.appendChild(nr);
    } else if (canShare()) {
      var nb = el('button', 'fmt-chip', '+ New code'); nb.type = 'button';
      nb.onclick = function () { f.newCode = ''; renderInsp(); };
      cf.appendChild(nb);
    }

    var m = ctx.meta || {};
    iChips(iField('Team', R), [[m.home || 'Home', m.home || 'Home'], [m.away || 'Away', m.away || 'Away']], f.team, function (v) {
      f.team = f.team === v ? null : v; renderInsp();
    });
    iChips(iField('Outcome', R), ['Won the ball', 'Foul won', 'Lost'], f.outcome, function (v) {
      f.outcome = f.outcome === v ? null : v; renderInsp();
    });
    iChips(iField('Zone', R), ['Def. third', 'Mid third', 'Final third'], f.zone, function (v) {
      f.zone = f.zone === v ? null : v; renderInsp();
    });
    var pf = iField('Players', R);
    var pi = el('input', 'fmt-input'); pi.type = 'text'; pi.maxLength = 200; pi.placeholder = 'e.g. #6, #13'; pi.value = f.players;
    pi.addEventListener('input', function () { f.players = pi.value; });
    pf.appendChild(fieldDone(pi));
    var nf = iField('Note', R);
    var ta = el('textarea', 'fmt-input'); ta.maxLength = 2000; ta.rows = 2; ta.value = f.note;
    ta.placeholder = 'What should the room see here?';
    ta.addEventListener('input', function () { f.note = ta.value; });
    nf.appendChild(ta);
    var lf = iField('Save to playlist', R);
    if (f.newPlaylist != null) {
      var npi = el('input', 'fmt-input'); npi.type = 'text'; npi.maxLength = 80; npi.placeholder = 'Name of the new playlist'; npi.value = f.newPlaylist;
      npi.addEventListener('input', function () { f.newPlaylist = npi.value; });
      lf.appendChild(fieldDone(npi));
    } else {
      var sel = el('select', 'fmt-input');
      var none = el('option', null, 'No playlist'); none.value = ''; sel.appendChild(none);
      ((tagData && tagData.playlists) || []).forEach(function (pl) {
        var o = el('option', null, pl.name); o.value = pl.id;
        if (pl.id === f.playlistId) o.selected = true;
        sel.appendChild(o);
      });
      var mk = el('option', null, 'New playlist…'); mk.value = '__new'; sel.appendChild(mk);
      sel.value = f.playlistId || '';
      sel.addEventListener('change', function () {
        if (sel.value === '__new') { f.newPlaylist = ''; renderInsp(); return; }
        f.playlistId = sel.value;
        sel.blur();
      });
      lf.appendChild(sel);
    }
    var share = canShare()
      ? [['private', 'Private'], ['channel', 'Whole channel']]
      : [['private', 'Private']];
    var sf = iField('Share with', R);
    iChips(sf, share, f.visibility, function (v) { f.visibility = v; renderInsp(); });
    if (!canShare()) sf.appendChild(el('div', 'fmt-hint', 'Only analysts and admins can share with the channel.'));

    iActions('Cancel', closeTag, f.saving ? 'Saving…' : 'Save tag', saveTagForm, 'check');
  }

  /* ---------------------------------------------------------------
     The clip drawer
     --------------------------------------------------------------- */
  function togglePanel(on) {
    if (!ctx || !ctx.box) return;
    if (panel && !on) { panel.remove(); panel = null; return; }
    if (panel) { renderPanel(); return; }
    panel = el('div', 'fmt-panel');
    ctx.box.appendChild(panel);
    renderPanel();
  }
  function renderPanel() {
    if (!panel) return;
    var list = clips();
    panel.innerHTML = '';
    var tab = canTag() ? panelTab : 'clips';
    var head = el('div', 'fmt-p-head');
    if (canTag()) {
      [['clips', 'Clips (' + list.length + ')'], ['tags', 'Tags (' + tagList().length + ')']].forEach(function (k) {
        var t = el('button', 'fmt-p-tab' + (tab === k[0] ? ' on' : ''), k[1]);
        t.type = 'button';
        t.onclick = function () {
          panelTab = k[0];
          if (k[0] === 'tags' && !tagData) loadTags();
          renderPanel();
        };
        head.appendChild(t);
      });
      head.appendChild(el('span', 'fmt-p-grow'));
    } else {
      head.appendChild(el('b', null, 'Clips (' + list.length + ')'));
    }
    var bX = el('button', 'fmt-p-btn', '✕');
    bX.type = 'button'; bX.onclick = function () { togglePanel(false); };
    if (tab === 'clips') {
      var bAll = el('button', 'fmt-p-btn', '▶ Play all');
      bAll.type = 'button'; bAll.onclick = playAll;
      head.appendChild(bAll);
    }
    head.appendChild(bX);
    panel.appendChild(head);
    if (tab === 'tags') { renderTagPanel(); return; }

    if (!list.length) {
      panel.appendChild(el('div', 'fmt-p-none', 'No clips yet. Press [ and ] on the picture, '
        + 'or use "Clip around this event".'));
      return;
    }
    list.forEach(function (c, i) {
      var row = el('div', 'fmt-p-row');
      var t = el('span', 'fmt-p-t', clock(c.in) + '–' + clock(c.out));
      var nm = el('span', 'fmt-p-nm', c.title);
      var go = el('button', 'fmt-p-btn', '▶'); go.type = 'button';
      go.onclick = function () { play = { list: list, i: i, clip: c }; playClip(c); };
      var dl = el('button', 'fmt-p-btn', '⭳'); dl.type = 'button';
      // a render that already proved the header is missing says so on the button,
      // instead of letting the analyst find out again forty seconds at a time
      if (corsState === false) {
        dl.classList.add('off');
        dl.title = 'The video host has not enabled CORS — cannot render yet';
      } else {
        dl.title = 'Download .mp4';
      }
      dl.onclick = function () { exportClip(c.in, c.out, c.title, c.edit); };
      var ed = el('button', 'fmt-p-btn', '✎'); ed.type = 'button';
      ed.title = 'Open in the clip editor';
      ed.onclick = function () { openEditor(c.id); };
      var rm = el('button', 'fmt-p-btn', '✕'); rm.type = 'button';
      rm.onclick = function () {
        if (editor && editor.clip.id === c.id) closeEditor();
        var l = clips(); l.splice(i, 1); setClips(l); renderPanel();
      };
      row.appendChild(t); row.appendChild(nm);
      row.appendChild(go); row.appendChild(ed); row.appendChild(dl); row.appendChild(rm);
      panel.appendChild(row);
    });
  }
  function renderTagPanel() {
    var pls = (tagData && tagData.playlists) || [];
    if (!tagData) {
      panel.appendChild(el('div', 'fmt-p-none', 'Loading the tags of this match…'));
      return;
    }
    if (pls.length) {
      var sel = el('select', 'fmt-input');
      var all = el('option', null, 'Every playlist'); all.value = ''; sel.appendChild(all);
      pls.forEach(function (pl) {
        var o = el('option', null, pl.name); o.value = pl.id;
        if (pl.id === panelList) o.selected = true;
        sel.appendChild(o);
      });
      sel.value = panelList;
      sel.addEventListener('change', function () { panelList = sel.value; sel.blur(); renderPanel(); });
      panel.appendChild(sel);
    }
    var rows = tagList().filter(function (x) { return !panelList || x.playlistId === panelList; });
    if (!rows.length) {
      panel.appendChild(el('div', 'fmt-p-none', 'No tags here yet. Press G on the picture to tag a moment.'));
      return;
    }
    rows.forEach(function (x) {
      var row = el('div', 'fmt-p-row');
      var dot = el('span', 'fmt-p-dot'); dot.style.background = x.color || '#6C6164';
      row.appendChild(dot);
      row.appendChild(el('span', 'fmt-p-t', clock(x.tIn) + '–' + clock(x.tOut)));
      var nm = el('span', 'fmt-p-nm', tagTitle(x) + (x.visibility === 'channel' ? ' · shared' : ''));
      nm.title = [x.team, x.outcome, x.zone, x.players, x.note].filter(Boolean).join(' · ');
      row.appendChild(nm);
      var go = el('button', 'fmt-p-btn', '▶'); go.type = 'button';
      go.onclick = function () {
        if (x.tIn < ctx.win.start - 0.05 || x.tOut > ctx.end() + 0.05) {
          toast('That tag is in the other half. Switch half to play it');
          return;
        }
        play = { clip: { id: x.id, in: x.tIn, out: x.tOut, title: tagTitle(x) } };
        playClip(play.clip);
      };
      row.appendChild(go);
      if (scope && x.createdBy === scope.userId) {
        var ed = el('button', 'fmt-p-btn', '✎'); ed.type = 'button'; ed.title = 'Edit this tag';
        ed.onclick = function () {
          openTag(x.tIn, { id: x.id, a: x.tIn, b: x.tOut, code: x.code, color: x.color, team: x.team,
            outcome: x.outcome, zone: x.zone, players: x.players || '', note: x.note || '',
            playlistId: x.playlistId || '', visibility: x.visibility });
        };
        row.appendChild(ed);
      }
      if (scope && (x.createdBy === scope.userId || scope.role === 'admin')) {
        var rm = el('button', 'fmt-p-btn', '✕'); rm.type = 'button'; rm.title = 'Delete this tag';
        rm.onclick = function () { removeTag(x); };
        row.appendChild(rm);
      }
      panel.appendChild(row);
    });
  }

  /* ---------------------------------------------------------------
     The context menu

     A child of the FULL-SCREEN element, never of document.body: the fullscreen
     element renders in the top layer, and a node outside it is simply not
     painted however high its z-index.
     --------------------------------------------------------------- */
  function closeMenu() {
    if (!menu) return;
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    if (ctx && ctx.box) ctx.box.removeEventListener('pointerdown', onBoxDown);
    menu = null;
  }

  /* Clicking away shuts the menu — the one thing every context menu on earth
     does and this one did not.

     It does NOT preventDefault: shutting a menu must not also swallow the click
     on the row of the event list underneath it.

     The `within` guard is the line that must never be dropped. The items are
     <button>s driven by onclick, and click fires AFTER pointerdown; without it
     pressing an item would shut the menu at pointerdown, tear the button out of
     the document, and the click would never arrive — every item in the menu
     silently dead. */
  function onBoxDown(e) {
    if (!menu) return;
    if (within(menu, e.target)) return;
    closeMenu();
  }

  /* How far a point is from a shape, in video pixels — enough to answer "did
     the analyst right-click ON something", which is all the hit-testing this
     needs. The menu already knows where the click landed in video pixels, so
     this is arithmetic rather than a second pointer system. */
  function segDist(p, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy;
    var u = L ? clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L, 0, 1) : 0;
    return Math.sqrt(Math.pow(p.x - (a.x + u * vx), 2) + Math.pow(p.y - (a.y + u * vy), 2));
  }
  function distTo(s, p) {
    var i, d, best = 1e9;
    // the whole disc, not the ring: an analyst pointing at the player they lit
    // is pointing at the middle of it
    if (s.kind === 'spotlight') {
      var cy0 = s.look && s.look !== 'circle' ? s.at.y - s.r * 2 : s.at.y;
      var rr0 = s.look && s.look !== 'circle' ? s.r * 2.6 : s.r;
      return Math.max(0, Math.sqrt(Math.pow(p.x - s.at.x, 2) + Math.pow(p.y - cy0, 2)) - rr0);
    }
    if (s.kind === 'link' || (s.kind === 'measure' && s.sub === 'area')) {
      var ps = s.pts || [];
      for (i = 0; i + 1 < ps.length; i++) {
        d = segDist(p, ps[i], ps[i + 1]);
        if (d < best) best = d;
      }
      if (ps.length === 1) best = segDist(p, ps[0], ps[0]);
      return ps.length ? best : null;
    }
    if (s.kind === 'measure') return segDist(p, s.from, s.to);
    if (s.kind === 'marker' || s.kind === 'text')
      return Math.sqrt(Math.pow(p.x - s.at.x, 2) + Math.pow(p.y - s.at.y, 2));
    if (s.kind === 'arrow') return segDist(p, s.from, s.to);
    if (s.kind === 'zone') {
      var x0 = Math.min(s.from.x, s.to.x), x1 = Math.max(s.from.x, s.to.x);
      var y0 = Math.min(s.from.y, s.to.y), y1 = Math.max(s.from.y, s.to.y);
      var dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1);
      return Math.sqrt(dx * dx + dy * dy);
    }
    if (s.kind === 'pen') {
      for (i = 0; i < s.pts.length; i++) {
        d = Math.sqrt(Math.pow(p.x - s.pts[i][0], 2) + Math.pow(p.y - s.pts[i][1], 2));
        if (d < best) best = d;
      }
      return best;
    }
    return null;
  }
  function hitShape(p, t) {
    if (!p) return null;
    var live = liveAt(t).filter(function (s) { return !s.extra; })
      .map(function (s) { return resolved(s, t); });
    var best = null, bd = 1e9, i, d;
    for (i = live.length - 1; i >= 0; i--) {     // topmost first
      d = distTo(live[i], p);
      if (d != null && d < bd) { bd = d; best = live[i]; }
    }
    return bd <= (layer ? layer.h * 0.05 : 40) ? best : null;
  }

  /* A link to one second of the match, in a page that is addressed by its HASH.

     It used to be `location.href.split('?')[0] + '?t=' + …`, and that is wrong
     in both of the two shapes the channel actually takes:

       app.html#/match/SLB01            -> app.html#/match/SLB01?t=742.10
         the query lands INSIDE the fragment, so route() reads the slug as
         "SLB01?t=742.10", matches no match, and sends the reader to #/home
       app.html?club=slu#/match/SLB01   -> app.html?t=742.10
         split('?') threw the fragment away with the query, so the reader lands
         on the channel's front page and the match is gone entirely

     `t` belongs in the REAL query string, ahead of the hash. Then every other
     reader goes on seeing exactly what it saw — route() gets a clean hash, the
     ?club= that picks the channel survives, the tagging app's #match= survives
     — and attach()'s /[?&]t=/ finds it either way.

     Written by hand rather than with URL/URLSearchParams so it has no ambient
     dependency to stub, and so copying a link twice replaces `t` instead of
     stacking a second one. */
  function momentLink(t) {
    var href = location.href, hash = '';
    var h = href.indexOf('#');
    if (h >= 0) { hash = href.slice(h); href = href.slice(0, h); }
    var q = href.indexOf('?');
    var base = q >= 0 ? href.slice(0, q) : href;
    var parts = (q >= 0 ? href.slice(q + 1) : '').split('&').filter(function (p) {
      return p !== '' && p !== 't' && p.slice(0, 2) !== 't=';
    });
    parts.push('t=' + t.toFixed(2));
    return base + '?' + parts.join('&') + hash;
  }

  /* The event under the frame: the nearest tagged moment within six seconds.
     This, and not anything about where the click landed, is what the header chip
     reads. There is no player position anywhere in the data, so "near #6" could
     only ever be a guess; "the event running now is #6's" is a fact. */
  function cueAt(t) {
    var best = null, bd = 6;
    ((ctx && ctx.cues) || []).forEach(function (c) {
      var d = Math.abs(c.t - t);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }
  function cuePlayer(c) {
    var r = c && c.rows && c.rows[0];
    return r && r.playerFrom ? String(r.playerFrom) : '';
  }

  /* Rows are `{label, row, sub}`: a branch whose leaves sit side by side. Written
     as a branch so that everything that walks this tree (the builder, the tests)
     treats a button in a row exactly like an item in a list. */
  function menuModel(hit) {
    var t = hit.t, hs = hitShape(hit.p, t), who = cuePlayer(cueAt(t));
    var rate = (ctx.video && ctx.video.playbackRate) || 1;
    return [
      { head: clock(t) + ' · ' + (ctx.win.label || ''), chip: who ? 'Event: #' + who : null },
      { label: 'Playback', row: 'transport', sub: [
        { label: 'Step back one frame', icon: 'stepback', key: ',', run: function () { step(-1); } },
        { label: 'Play / pause', icon: 'pause', key: 'Space', run: function () { ctx.toggle(); } },
        { label: 'Step forward one frame', icon: 'stepfwd', key: '.', run: function () { step(1); } },
        { label: 'Speed', text: rate + '×', sub: [0.25, 0.5, 1, 1.5, 2].map(function (k) {
            return { label: k + '×', run: function () { setSpeed(k); } };
          }) },
        { label: loopAB ? 'Stop the A–B loop' : 'Loop A–B from here', icon: 'loop', key: 'L', on: !!loopAB, run: function () {
            if (loopAB) { loopAB = null; toast('Loop off'); }
            else { loopAB = { a: t, b: Math.min(ctx.end(), t + 8) }; toast('Looping ' + clock(loopAB.a) + '–' + clock(loopAB.b)); }
          } },
        { label: dim ? 'Undim' : 'Dim everything else', icon: 'dim', key: 'D', on: dim, run: function () {
            dim = !dim; ensureLayer(); paint(ctx.video.currentTime, 0);
          } }
      ] },

      { sep: true, title: 'TELESTRATION' },
      { label: 'Spotlight & track player', icon: 'spotlight', key: 'S', run: function () {
          if (!hit.p) { toast('Right-click on the picture itself'); return; }
          ensureLayer();
          // anchored to hit.t, not to now: the video kept playing under the menu
          var sp = addShape(newSpot(hit.p), t);
          selectShape(sp.id);           // straight into adjust: drag to place, wheel to size
        } },
      { label: 'Link players', icon: 'link', key: 'K', run: function () { startLink('chain', t); } },
      { label: 'Defensive line', icon: 'defline', key: 'N', run: function () { startLink('line', t); } },
      { label: 'Measure', icon: 'measure', key: 'M', sub: [
          { label: 'Distance', run: function () { startMeasure('distance', t); } },
          { label: 'Width', run: function () { startMeasure('width', t); } },
          { label: 'Depth', run: function () { startMeasure('depth', t); } },
          { label: 'Area', run: function () { startMeasure('area', t); } },
          { sep: true },
          { label: 'Calibrate the pitch here', run: function () { holdAt(t); selectShape(null); openCalib(); } }
        ] },
      { label: 'Draw', icon: 'draw', sub: [
          { label: 'Arrow', icon: 'arrow', run: function () { armTool('arrow'); } },
          { label: 'Curved arrow', icon: 'curve', run: function () { armTool('arrow', { curved: true }); } },
          { label: 'Dashed arrow (run without the ball)', icon: 'run', run: function () { armTool('arrow', { dash: true }); } },
          { label: 'Freehand', icon: 'freehand', run: function () { armTool('pen'); } },
          { label: 'Zone (half-space, pocket)', icon: 'zone', run: function () { armTool('zone'); } },
          { label: 'Text', icon: 'text', run: function () { armTool('text'); } },
          { label: 'Player marker', icon: 'marker', run: function () { armTool('marker'); } },
          { sep: true },
          { label: 'Undo the last shape', icon: 'undo', key: 'U', run: undo },
          { label: 'Clear all drawings', icon: 'trash', run: clearShapes }
        ] },
      { label: 'Freeze here & draw', icon: 'freeze', key: 'Q', run: function () { freezeDraw(t); } },
      // the Z hint is gone with the key: a menu advertising a shortcut that does
      // nothing is the exact defect this change went in to fix
      { label: zoom ? 'Reset the zoom' : 'Zoom in here (or use the wheel)', icon: 'zoom', run: function () {
          if (zoom) { zoom = null; applyZoom(); toast('Full size'); }
          else zoomBy(2, hit.p);
        } },

      /* Everything about ONE drawing, and it only appears when the right-click
         actually landed on one. This is the second way into selection; the
         first is clicking its bar on the lane. The drawing layer itself still
         takes no click, which is the rule Film has had since it was written. */
      hs ? { sep: true } : null,
      hs ? { label: 'Drawing here: ' + toolName(hs.kind), icon: 'draw', sub: [
          { label: 'Select to edit', run: function () { selectShape(hs.id); } },
          { label: 'Time window', sub: [1, 2, 3, 4, 5, 6, 8, 10].map(function (n) {
              return { label: n + ' s', key: n < 10 ? String(n) : null,
                       run: function () { selectShape(hs.id); setDur(n); renderInsp(); } };
            }) },
          { label: hs.life === 'pinned' ? 'Stop keeping it up' : '📌 Keep for the whole clip', key: '0',
            run: function () { selectShape(hs.id); togglePin(); renderInsp(); } },
          { label: 'Freeze frame on export', sub: [0, 2, 3, 4, 5].map(function (n) {
              return { label: n ? n + ' s' : 'Off',
                       run: function () { selectShape(hs.id); setFreeze(n); renderInsp(); } };
            }) },
          { label: 'Colour', sub: [['Red', ACCENT], ['White', HOME], ['Yellow', AWAY]].map(function (c) {
              return { label: c[0], run: function () {
                var real = shapeById(hs.id);
                if (!real) return;
                real.style = real.style || {}; real.style.color = c[1]; touch(real);
                renderInsp();
              } };
            }) },
          { sep: true },
          { label: 'Delete this drawing', key: 'Del', run: function () { removeShape(hs.id); } }
        ] } : null,

      /* anchored to hit.t, like every drawing item above: the video kept
         playing while the menu was being read, and a mark taken from the live
         clock landed wherever it had drifted to instead of on the frame the
         analyst right-clicked */
      { sep: true, title: 'CLIP' },
      { label: 'Clip tools', row: 'tiles', sub: [
          { label: 'Split the clip here', short: 'Split', icon: 'split', key: 'X', run: function () {
              holdAt(t);
              editAt(t, editSplit);
            } },
          { label: 'Mark clip START', short: 'In', icon: 'markin', key: '[', run: function () { markAt('in', t); } },
          { label: 'Mark clip END', short: 'Out', icon: 'markout', key: ']', run: function () { markAt('out', t); } },
          { label: 'Clip around this event (±6s)', short: '±6 s', icon: 'clip', key: 'A', run: function () { clipFromEvent(6); } },
          { label: 'Clip speed', short: 'Speed', icon: 'speed', key: 'V', run: function () { holdAt(t); editAt(t); } }
        ] },
      { label: 'Open clip editor', icon: 'layers', key: 'E', run: function () { holdAt(t); editAt(t); } },
      { label: 'Clip list…', icon: 'clip', key: 'C', run: function () { togglePanel(true); } },

      { sep: true, title: 'TAG & SHARE' },
      { label: 'Tag this moment', icon: 'tag', key: 'G', run: function () { openTag(t); } },
      { label: 'Add to playlist', icon: 'playlist', sub: playlistItems(t) },
      { label: 'Export', icon: 'download', sub: [
          { label: 'Save this frame (.png)', icon: 'image', run: savePNG },
          { label: 'Download the marked section (.mp4)', icon: 'clip', run: function () {
              if (mark.in != null && mark.out != null) exportClip(mark.in, mark.out);
              else {
                var l = clips();
                if (l.length) exportClip(l[l.length - 1].in, l[l.length - 1].out, l[l.length - 1].title, l[l.length - 1].edit);
                else toast('Mark [ and ] first');
              }
            } }
        ] },
      { label: 'Copy a link to this moment', icon: 'chain', run: function () {
          var u = momentLink(t);
          if (navigator.clipboard) navigator.clipboard.writeText(u).then(
            function () { toast('Link copied'); }, function () { toast(u); });
          else toast(u);
        } },
      { sep: true },
      { label: 'View', row: 'foot', sub: [
          { label: hidden ? 'Show the drawings' : 'Hide the drawings', short: 'Drawings', icon: 'eyeoff', key: 'H', on: hidden, run: function () {
              hidden = !hidden; if (layer) paint(ctx.video.currentTime, 0);
            } },
          { label: stripOn ? 'Hide the timeline' : 'Show the timeline', short: 'Timeline', icon: 'layers', key: 'T', run: function () { toggleStrip(); } },
          { label: 'Exit full screen', short: 'Exit', icon: 'minimize', key: 'Esc', run: function () { ctx.exitFull(); } }
        ] }
    ].filter(function (it) { return !!it; });   // the "Drawing here" pair drops out on a miss
  }

  function openMenu(e) {
    if (!ctx || !full) return;
    e.preventDefault();
    closeMenu();
    /* The video is deliberately NOT paused here. Opening the toolkit is not a
       transport command, and taking the analyst's playback away from them was
       the one thing they asked to stop.

       What that costs is the reason `hit` exists: the clock keeps moving while
       the menu is being read, so every item that creates a drawing anchors to
       hit.t — the frame that was actually right-clicked — and not to whatever
       currentTime has drifted to by the time the item is chosen. */
    var hit = { t: ctx.video.currentTime, p: toVideo(e.clientX, e.clientY) };

    menu = el('div', 'fmt-menu');
    fenceMenu(menu);
    build(menu, menuModel(hit));
    ctx.box.appendChild(menu);
    // taken off again by closeMenu(), so it exists only while the menu does
    ctx.box.addEventListener('pointerdown', onBoxDown);

    // keep it on screen: the click can be two pixels from the right-hand edge
    var b = ctx.box.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var x = clamp(e.clientX - b.x, 4, Math.max(4, b.width - mw - 4));
    var y = clamp(e.clientY - b.y, 4, Math.max(4, b.height - mh - 4));
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  }

  /* A press inside the menu goes no further than the menu: the stage's onDown
     would otherwise read it as "dismiss", and the wheel inside it is a scroll. */
  function fenceMenu(n) {
    ['pointerdown', 'wheel', 'contextmenu'].forEach(function (t) {
      n.addEventListener(t, function (e) {
        e.stopPropagation();
        if (t === 'contextmenu') e.preventDefault();
      });
    });
  }
  /* A submenu is position:fixed and placed by hand, because the menu itself now
     scrolls on a short screen and overflow would cut off anything absolute. Fixed
     is against the viewport here: stats-view.css guarantees no ancestor of the
     full-screen box sets a transform. Flips to the left at the edge of the screen,
     and is kept on it top to bottom. */
  function placeSub(wrap, sub) {
    var r = wrap.getBoundingClientRect();
    var W = window.innerWidth || 1920, H = window.innerHeight || 1080;
    var sw = sub.offsetWidth || 240, sh = sub.offsetHeight || 200;
    var x = r.right + 2;
    if (x + sw > W - 4) x = Math.max(4, r.left - sw - 2);
    sub.style.left = x + 'px';
    sub.style.top = clamp(r.top - 5, 4, Math.max(4, H - sh - 4)) + 'px';
  }
  function withSub(root, b, it) {
    b.classList.add('has-sub');
    var sub = el('div', 'fmt-m-sub');
    build(sub, it.sub);
    var wrap = el('div', 'fmt-m-wrap');
    wrap.appendChild(b); wrap.appendChild(sub);
    var place = function () { placeSub(wrap, sub); };
    wrap.addEventListener('mouseenter', place);
    wrap.addEventListener('focusin', place);
    root.appendChild(wrap);
  }
  function cell(root, it, kind) {
    var b = el('button', 'fmt-m-cell' + (it.on ? ' on' : ''));
    b.type = 'button';
    b.title = it.label + (it.key ? ' (' + it.key + ')' : '');
    b.setAttribute('aria-label', it.label);
    if (it.icon) b.appendChild(iconEl(it.icon));
    if (it.text) b.appendChild(el('span', 'fmt-m-ctext', it.text));
    if (kind !== 'transport' && it.short) b.appendChild(el('span', 'fmt-m-cl', it.short));
    if (kind !== 'transport' && it.key) b.appendChild(el('kbd', 'fmt-m-ck', it.key));
    if (it.sub) { withSub(root, b, it); return; }
    b.onclick = function (ev) { ev.stopPropagation(); closeMenu(); it.run(); };
    root.appendChild(b);
  }
  function build(root, model) {
    model.forEach(function (it) {
      if (it.head) {
        var h = el('div', 'fmt-m-head');
        h.appendChild(el('span', 'fmt-m-now', it.head));
        if (it.chip) h.appendChild(el('span', 'fmt-m-chip', it.chip));
        root.appendChild(h);
        return;
      }
      if (it.sep) {
        root.appendChild(el('div', 'fmt-m-sep'));
        if (it.title) root.appendChild(el('div', 'fmt-m-sec', it.title));
        return;
      }
      if (it.row) {
        var row = el('div', 'fmt-m-row ' + it.row);
        it.sub.forEach(function (x) { cell(row, x, it.row); });
        root.appendChild(row);
        return;
      }
      var b = el('button', 'fmt-m-it');
      b.type = 'button';
      if (it.icon) b.appendChild(iconEl(it.icon));
      else b.appendChild(el('span', 'fmt-ic none'));
      b.appendChild(el('span', 'fmt-m-l', it.label));
      if (it.key) b.appendChild(el('span', 'fmt-m-k', it.key));
      if (it.sub) {
        b.appendChild(iconEl('chev', 'fmt-m-chev'));
        withSub(root, b, it);
        return;
      }
      b.onclick = function (ev) { ev.stopPropagation(); closeMenu(); it.run(); };
      root.appendChild(b);
    });
  }

  /* ---------------------------------------------------------------
     Keyboard. Called by filmKeys BELOW its Escape branch and ABOVE the
     transport keys; returning true means "taken", and only then is the default
     prevented. Escape is deliberately not here: Q3 settled it as one meaning in
     both full-screen modes — out — so the inner layers close on Backspace.
     --------------------------------------------------------------- */
  function key(e) {
    if (!ctx || !full) return false;
    var k = e.key;
    /* One stack, closed in the order it was opened. Adjust and selection are
       two new rungs; everything below them is where it always was. */
    if (k === 'Backspace') {
      if (menu) { closeMenu(); return true; }
      if (draft) { draft = null; drawDraft(); return true; }
      if (collect) { finishCollect(); return true; }
      if (calDraft) { endCalib(); closeInsp(); return true; }
      if (adjust) { adjust = null; armCursor(); return true; }
      if (mode) {
        armTool(null);
        if (insp && insp.kind === 'measure') closeInsp();
        return true;
      }
      if (selected) { selectShape(null); return true; }
      if (insp && insp.kind === 'tag') { closeTag(); return true; }
      if (insp && insp.kind !== 'clip') { closeInsp(); return true; }
      if (editor) { closeEditor(); return true; }
      if (panel) { togglePanel(false); return true; }
      return false;
    }
    if (menu && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter')) return false;
    /* The tag panel owns the number row and Enter while it is up: that is the
       code window. Everywhere else the number row stays the drawing's duration. */
    if (insp && insp.kind === 'tag') {
      if (k >= '1' && k <= '9') { pickCode(+k - 1); return true; }
      if (k === 'Enter') { saveTagForm(); return true; }
    }
    if (editor) {
      if (k === 'x' || k === 'X') { editSplit(); return true; }
      if (k === 'y' || k === 'Y') { editText(); return true; }
      if (k === 'q' || k === 'Q') { editFreeze(); return true; }
      if (k === 'u' || k === 'U') { undoEdit(); return true; }
      if (k === 'v' || k === 'V') { editSpeed(); return true; }
      if (k === 'p' || k === 'P') { editPeek(); return true; }
      if (k === '[') { editMark('a'); return true; }
      if (k === ']') { editMark('b'); return true; }
      if (k === 'Delete' && !selected) { editDelete(); return true; }
    }
    if (k === ',') { step(-1); return true; }
    if (k === '.') { step(1); return true; }
    if (k === '[') { markAt('in'); return true; }
    if (k === ']') { markAt('out'); return true; }
    if (k === 'h' || k === 'H') { hidden = !hidden; if (layer) paint(ctx.video.currentTime, 0); return true; }
    if (k === 'd' || k === 'D') { dim = !dim; ensureLayer(); paint(ctx.video.currentTime, 0); return true; }
    if (k === 'c' || k === 'C') { togglePanel(!panel); return true; }
    if (k === 't' || k === 'T') { toggleStrip(); return true; }

    /* S, at last. The menu has advertised it since the day this file was
       written and nothing was ever bound to it. It needs a place to put the
       light, and the keyboard has none — hence `ptr`, the last position the
       pointer was seen at over the picture, with the centre as the fallback. */
    if (k === 's' || k === 'S') {
      ensureLayer();
      if (!layer) return false;
      var at = ptr || { x: layer.w / 2, y: layer.h / 2 };
      var sp = addShape(newSpot(at));
      selectShape(sp.id);
      toast('Spotlight — drag to move it, wheel to resize');
      return true;
    }
    var nowK = ctx.video.currentTime;
    if (k === 'k' || k === 'K') { startLink('chain', nowK); return true; }
    if (k === 'n' || k === 'N') { startLink('line', nowK); return true; }
    if (k === 'm' || k === 'M') { startMeasure(lastMeasure, nowK); return true; }
    if (k === 'q' || k === 'Q') { freezeDraw(nowK); return true; }
    if (k === 'a' || k === 'A') { clipFromEvent(6); return true; }
    if (k === 'e' || k === 'E') { editAt(nowK); return true; }
    if (k === 'x' || k === 'X') { editAt(nowK, editSplit); return true; }
    if (k === 'v' || k === 'V') { editAt(nowK); return true; }
    if (k === 'g' || k === 'G') { openTag(nowK); return true; }
    if (k === 'u' || k === 'U') {
      if (!shapes.length) return false;
      undo();
      return true;
    }

    /* The window, on the number row. These return FALSE when there is nothing
       to apply them to, so a stray keypress is handed back to the page rather
       than silently eaten. */
    if (k >= '1' && k <= '9') {
      if (!selected && !mode) return false;
      setDur(+k); return true;
    }
    if (k === '0') {
      if (!selected) return false;
      return togglePin();
    }
    if (k === 'Delete') {
      if (!selected) return false;
      removeShape(selected); return true;
    }
    if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      if (!selected) return false;
      return nudge(k === 'ArrowRight' ? 1 : -1);
    }
    if (k === 'l' || k === 'L') {
      var t = ctx.video.currentTime;
      loopAB = loopAB ? null : { a: t, b: Math.min(ctx.end(), t + 8) };
      toast(loopAB ? 'Looping ' + clock(loopAB.a) + '–' + clock(loopAB.b) : 'Loop off');
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------
     The four calls stats-view.js makes
     --------------------------------------------------------------- */
  function attach(c) {
    ctx = c;
    /* The pending clip mark is the one piece of state here that must SURVIVE a
       re-attach. filmStart() re-attaches on every redraw of the view and on
       every change of half, and this line used to throw the mark away with
       everything else: the analyst pressed [ , the list redrew under them,
       pressed ] , and no clip was saved and nothing said why.

       It is dropped only where it stops meaning anything — another match, or
       another half, which is a different window on the same file. */
    var mk = matchKey() + '#' + ((c.win && c.win.half) || 0);
    if (mk !== markKey) { mark = { in: null, out: null }; markKey = mk; }

    shapes = []; draft = null; mode = null; dim = false; zoom = null;
    loopAB = null; hidden = false;
    selected = null; adjust = null; ptr = null; anchor = null; strip = null;
    ctx.stage.addEventListener('contextmenu', openMenu);
    ctx.stage.addEventListener('pointerdown', onDown);
    ctx.stage.addEventListener('pointermove', onPtr);
    // passive:false or preventDefault() is ignored and the page scrolls anyway
    ctx.stage.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', relayout);
    ctx.video.addEventListener('loadedmetadata', onMeta);
    measureFps();
    restore();
    // full screen is set BEFORE this call (filmStart calls filmFullSet first),
    // so a mark carried through the redraw says so again straight away
    renderMark();
    if (full) loadTags();
    // the editor comes back with the stage, so filtering the list does not lose it
    var back = resumeEditor; resumeEditor = null;
    if (back && back.match === matchKey() && full) reopenEditor(back.id);
    // a ?t= link lands on the moment it names, once the file knows its own length
    var q = /[?&]t=(\d+(?:\.\d+)?)/.exec(location.href);
    if (q) ctx.video.addEventListener('loadedmetadata', function once() {
      ctx.video.removeEventListener('loadedmetadata', once);
      ctx.seek(parseFloat(q[1]));
    });
  }
  function relayout() { placeLayer(); placeStrip(); placeInsp(); if (editor) renderEditor(); }
  /* openEditor() reads the video's clock, and on a redraw the new element has
     none yet; it is safe to wait for it, and to give up quietly if it never comes. */
  function reopenEditor(cid) {
    var v = ctx.video;
    if (v.readyState >= 1 || !v.addEventListener) { openEditor(cid); return; }
    v.addEventListener('loadedmetadata', function once() {
      v.removeEventListener('loadedmetadata', once);
      if (ctx && ctx.video === v && full) openEditor(cid);
    });
  }
  function onMeta() { relayout(); measureFps(); }

  function detach() {
    if (!ctx) return;
    closeMenu();
    if (edDragEnd) edDragEnd();
    clearTimeout(editSave);
    resumeEditor = editor ? { id: editor.clip.id, match: matchKey() } : null;
    if (editor) saveEdit();
    closeEditor();
    closeInsp();
    collect = null;
    calDraft = null;
    if (fadeEl) { fadeEl.remove(); fadeEl = null; }
    // a spotlight dragged in the last fifth of a second still owes the disk a write
    clearTimeout(saveT);
    clearTimeout(toastT);          // …and a toast counting down owes the DOM nothing
    if (shapes.length) persist();
    if (panel) { panel.remove(); panel = null; }
    if (toastEl) { toastEl.remove(); toastEl = null; }
    // renderFilm() replaces the innerHTML of the box this hangs in, so holding
    // the node across a redraw would leave a live variable pointing at nothing
    if (markEl) { markEl.remove(); markEl = null; }
    ctx.stage.removeEventListener('contextmenu', openMenu);
    ctx.stage.removeEventListener('pointerdown', onDown);
    ctx.stage.removeEventListener('pointermove', onPtr);
    ctx.stage.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', relayout);
    ctx.video.removeEventListener('loadedmetadata', onMeta);
    try { ctx.video.style.transform = ''; } catch (e) {}
    dropStrip();
    dropLayer();
    ctx = null; full = false; mode = null; draft = null; play = null;
    selected = null; adjust = null; ptr = null;
  }

  /* Every frame Film paints. Cheap on the common path: no layer and no loop
     means two comparisons and a return. */
  function frame(now) {
    if (!ctx) return;
    if (loopAB && now >= loopAB.b) { ctx.seek(loopAB.a); return; }
    if (play && play.clip && now >= play.clip.out) {
      if (play.list) advancePlaylist();
      else {
        ctx.pause(); play = null;
        if (!editor) endPreview();
      }
      return;
    }
    if (editor || (play && play.clip && play.clip.edit)) {
      // scrubbing away from a clip that is playing ends the preview, not the film
      if (!editor && (now < play.clip.in - 0.5 || now > play.clip.out + 0.5)) {
        play = null; endPreview();
      } else runEdit(now);
    }
    if (layer) paint(now, (now * 1.2) % 1);
    stripCursor(now);
    editorCursor(now);
  }

  function fullscreen(on) {
    full = !!on;
    if (!full) {
      closeMenu();
      if (panel) { togglePanel(false); }
      closeEditor();
      resumeEditor = null;
      closeInsp();
      inspPos = null;
      collect = null;
      calDraft = null;
      armTool(null);
      adjust = null; selected = null; armCursor();
      dropStrip();                       // telestration is a full-screen room only
    } else {
      if (ctx) loadTags();
      ensureStrip();
    }
    /* Called BEFORE attach() on a redraw, so ctx can still be null here —
       renderMark() checks for it, and attach() calls it again once there is one. */
    renderMark();
    // the stage just changed size; the picture inside it moved with it
    setTimeout(relayout, 0);
  }

  /* The host page says whose channel and which match this is; the view it mounts
     has no idea, and does not need one. Moving to another match forgets the tags
     of the last one before anything can be drawn with them. */
  function setScope(next) {
    var same = scope && next && scope.matchUuid === next.matchUuid && scope.clubId === next.clubId;
    scope = next || null;
    if (!same) { tagData = null; tagLoad = null; tagFail = null; panelList = ''; }
  }

  return {
    attach: attach, detach: detach, frame: frame, fullscreen: fullscreen, key: key,
    setScope: setScope,
    // named so tests can drive the parts that have no DOM of their own
    _internals: {
      pictureRect: pictureRect, toVideo: toVideo, shapeNode: shapeNode,
      pickMime: pickMime, menuModel: function (h) { return menuModel(h); },
      momentLink: momentLink,
      state: function () {
        return { shapes: shapes, dim: dim, zoom: zoom, hidden: hidden,
                 mode: mode, loopAB: loopAB, mark: mark, full: full, fps: fps,
                 selected: selected, adjust: adjust, ptr: ptr,
                 strip: strip, stripOn: stripOn, defaultDur: defaultDur,
                 menu: menu, corsState: corsState };
      },
      setCtx: function (c) { ctx = c; }, setFull: function (f) { full = f; },
      clips: clips, setClips: setClips, saveClip: saveClip, STORE_KEY: STORE_KEY,
      // the time model, so the window can be tested without a browser
      liveAt: liveAt, alpha: alpha, upgrade: upgrade, hitShape: hitShape,
      openSource: openSource, corsUrl: corsUrl, NEED_CORS: NEED_CORS,
      setCors: function (s) { corsState = s; },
      exportClip: function (a, b, t) { return exportClip(a, b, t); },
      selectShape: selectShape, originOnElement: originOnElement,
      onWheel: function (e) { return onWheel(e); },
      overlaySVGString: function (n, p) { return overlaySVGString(n, p); },
      paint: function (n, p) { return paint(n, p); },
      // the new layer: pure parts first, so they can be tested without a browser
      lerpKeys: lerpKeys, upsertKey: upsertKey, resolved: resolved, geoKey: geoKey,
      homography: homography, applyH: applyH, collinear: collinear, polyArea: polyArea,
      pitchMarks: pitchMarks, fmtLen: fmtLen, fmtArea: fmtArea, newEdit: newEdit,
      segAt: segAt, splitAt: splitAt, trimSeg: trimSeg, dropSeg: dropSeg, syncClip: syncClip,
      fadeAlpha: fadeAlpha, planOf: planOf, cueAt: cueAt, cuePlayer: cuePlayer,
      startLink: startLink, finishCollect: finishCollect, startMeasure: startMeasure,
      openCalib: openCalib, applyCalib: applyCalib, setTrack: setTrack, keyTimes: keyTimes,
      placeAdjust: placeAdjust, removeKeyAt: removeKeyAt, freezeDraw: freezeDraw,
      openEditor: openEditor, closeEditor: closeEditor, editAt: editAt,
      editPeek: editPeek, editSpeed: editSpeed, editSplit: editSplit, editDelete: editDelete, editFreeze: editFreeze, editText: editText,
      undoEdit: undoEdit, runEdit: runEdit, openTag: openTag, saveTagForm: saveTagForm,
      pickCode: pickCode, canTag: canTag, canShare: canShare, loadTags: loadTags,
      removeTag: removeTag, fileToPlaylist: fileToPlaylist, renderPanel: renderPanel,
      togglePanel: togglePanel, tagList: tagList,
      ui: function () {
        return { insp: insp, editor: editor, collect: collect, calDraft: calDraft, cal: cal,
                 tagData: tagData, scope: scope, units: units, hold: hold, previewRate: previewRate,
                 exportTexts: exportTexts, panel: panel, panelTab: panelTab };
      },
      setCal: function (c) { cal = c; },
      setTab: function (t) { panelTab = t; }
    }
  };
})();
