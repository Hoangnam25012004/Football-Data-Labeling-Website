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

  /* mm:ss of the MATCH clock — the same reading the transport bar shows, so a
     clip's name and the bar under it cannot disagree about when it happened */
  function clock(t) { return ctx ? ctx.clock(ctx.matchTime(t)) : '00:00'; }

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
    toast(zoom ? 'Phóng ' + zoom.k.toFixed(1) + '×' : 'Cỡ thật');
  }

  /* ---------------------------------------------------------------
     Rendering a shape

     One function, used by the screen and by both exports — the export
     rasterises this same SVG rather than re-drawing the shapes with a second
     set of code that would drift out of step with this one.
     --------------------------------------------------------------- */
  function shapeNode(s, phase) {
    var st = s.style || {}, col = st.color || ACCENT, wd = st.width || 6;
    var g = svgEl('g', { 'class': 'fmt-s fmt-' + s.kind });
    var i, p;
    if (s.kind === 'spotlight') {
      var rr = s.r * (st.pulse ? (1 + 0.06 * Math.sin(phase * Math.PI * 2)) : 1);
      g.appendChild(svgEl('circle', {
        cx: s.at.x, cy: s.at.y, r: rr, fill: 'none',
        stroke: col, 'stroke-width': wd
      }));
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
        stroke: '#000', 'stroke-width': fs * 0.09, 'paint-order': 'stroke'
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
    return shapes.filter(function (s) {
      if (s.life === 'pinned') return true;
      var f = s.fade || 0;
      return s.in - f <= now && now <= s.out + f;   // widened for the fade
    });
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
      m.appendChild(svgEl('circle', { cx: s.at.x, cy: s.at.y, r: s.r, fill: '#000' }));
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
      .map(function (s) { return s.id + ':' + s.at.x + ':' + s.at.y + ':' + s.r; }).join(',');
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
      var n = layer.nodes[s.id];
      if (!n || n.__rev !== s.rev) {
        if (n && n.parentNode) layer.gShapes.removeChild(n);
        n = shapeNode(s, phase); n.__rev = s.rev;
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
    paintDim(live);
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
    s.byMatch[matchKey()] = { v: 2, shapes: shapes,
                              clips: (s.byMatch[matchKey()] || {}).clips || [] };
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
    persist();
    if (layer) paint(ctx.video.currentTime, 0);
    renderStrip();
  }
  function undo() {
    if (!shapes.length) return;
    var gone = shapes.pop();
    if (selected === gone.id) selected = null;
    if (adjust && adjust.id === gone.id) { adjust = null; armCursor(); }
    persist(); paint(ctx.video.currentTime, 0); renderStrip();
  }
  function clearShapes() {
    shapes = []; selected = null; adjust = null; armCursor(); persist();
    if (layer) paint(ctx.video.currentTime, 0);
    renderStrip();
  }

  /* ---------------------------------------------------------------
     Editing the window — the part that was missing entirely
     --------------------------------------------------------------- */
  function setDur(sec) {
    defaultDur = clamp(sec, 1, 60);
    var s = shapeById(selected);
    if (s) {
      s.life = 'moment'; s.in = s.t; s.out = s.t + defaultDur;
      touch(s);
      toast('Cửa sổ ' + defaultDur.toFixed(1) + ' s · ' + clock(s.in) + '–' + clock(s.out));
    } else {
      toast('Hình sau: ' + defaultDur.toFixed(1) + ' s');
    }
  }
  function togglePin() {
    var s = shapeById(selected);
    if (!s) return false;
    s.life = s.life === 'pinned' ? 'moment' : 'pinned';
    if (s.life === 'moment') { s.in = s.t; s.out = s.t + defaultDur; }
    touch(s);
    toast(s.life === 'pinned' ? '📌 Giữ suốt clip' : 'Trở lại một khoảnh khắc');
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
    toast(s.freeze ? 'Đứng hình ' + s.freeze + ' s khi xuất clip' : 'Không đứng hình');
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
    adjust = (s && s.kind === 'spotlight') ? { id: sid } : null;
    armCursor();
    if (layer) paint(ctx.video.currentTime, 0);
    renderStrip();
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
      layer.svg.classList.toggle('fmt-armed', !!mode);
      layer.svg.classList.toggle('fmt-adjust', !mode && !!adjust);
    }
    if (ctx && ctx.box) ctx.box.classList.toggle('fmt-drawing', !!mode);
  }
  function armTool(kind, opts) {
    mode = kind ? Object.assign({ kind: kind }, opts || {}) : null;
    if (mode) adjust = null;
    ensureLayer();
    armCursor();
    toast(mode
      ? toolName(kind) + ' · ' + defaultDur.toFixed(1) + ' s — kéo trên khung hình. '
        + '1–9 đổi thời lượng, Backspace để thoát.'
      : '');
  }
  function toolName(k) {
    return { arrow: 'Mũi tên', pen: 'Bút vẽ', zone: 'Vùng', text: 'Chữ',
             marker: 'Đánh dấu cầu thủ', spotlight: 'Rọi đèn' }[k] || k;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    var p = toVideo(e.clientX, e.clientY); if (!p) return;

    /* Moving the spotlight being adjusted. No tool is armed here — this is the
       mode a spotlight drops into the moment it is placed, so the analyst can
       put it exactly on the player instead of starting again. */
    if (!mode && adjust) {
      var sp = shapeById(adjust.id);
      if (!sp) { adjust = null; armCursor(); return; }
      e.preventDefault(); e.stopPropagation();
      sp.at = p; touch(sp, true); persistSoon();
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

    if (mode.kind === 'text') { textAt(p, base, anchor); return; }
    if (mode.kind === 'spotlight') {
      base.style.pulse = true;
      var ns = addShape(Object.assign(base, { kind: 'spotlight', at: p,
        r: Math.round(layer.h * 0.075) }), anchor);
      selectShape(ns.id);
      return;
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
    commit(d, anchor);
  }

  /* Dragging the adjusted spotlight around. Repaint every move, save once. */
  function onSpotMove(e) {
    if (!adjust) return;
    var p = toVideo(e.clientX, e.clientY); if (!p) return;
    var sp = shapeById(adjust.id); if (!sp) return;
    sp.at = p; touch(sp, true); persistSoon();
  }
  function onSpotUp() {
    layer.svg.removeEventListener('pointermove', onSpotMove);
    layer.svg.removeEventListener('pointerup', onSpotUp);
    persist(); renderStrip();
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
    if (adjust) resizeSpot(adjust.id, up ? 1.08 : 1 / 1.08);
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
  function stripWanted() { return !!(ctx && full && stripOn && shapes.length); }

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
    var st = strip.el.style;
    st.left = (r.x - s.x) + 'px';
    st.width = r.w + 'px';
    st.height = STRIP_H + 'px';
    // room in the letterbox: sit in it, and cover no grass at all
    if (head >= STRIP_NEED) {
      st.top = Math.max(0, head - STRIP_H - 4) + 'px';
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
    placeStrip();
  }
  function stripCursor(now) {
    if (!strip || !ctx) return;
    var sp = stripSpan();
    strip.cur.style.left = (clamp((now - sp.a) / sp.span, 0, 1) * 100) + '%';
  }
  function toggleStrip(on) {
    stripOn = on == null ? !stripOn : !!on;
    if (stripOn) ensureStrip(); else dropStrip();
    toast(stripOn ? 'Hiện thanh thời gian' : 'Ẩn thanh thời gian');
  }

  /* A real input, placed where the click was: typing into a prompt() would take
     the focus out of the document and, in some browsers, out of full screen. */
  function textAt(p, base, at) {
    var r = pictureRect(), s = ctx.stage.getBoundingClientRect();
    var inp = el('input', 'fmt-text-in');
    inp.type = 'text'; inp.placeholder = 'Nhập chữ, Enter để đặt';
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
    if (!sticky) toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
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
    toast('Tốc độ ' + k + '×');
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
  function markAt(which) {
    if (!ctx) return;
    mark[which] = ctx.video.currentTime;
    if (mark.in != null && mark.out != null && mark.out < mark.in) {
      var t = mark.in; mark.in = mark.out; mark.out = t;
    }
    toast(which === 'in' ? 'Đầu clip ' + clock(mark.in) : 'Cuối clip ' + clock(mark.out));
    if (mark.in != null && mark.out != null) saveClip(mark.in, mark.out);
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
    toast('Đã lưu "' + c.title + '" (' + Math.round(b - a) + 's)');
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
    if (!best) { toast('Không có event nào gần đây'); return; }
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
    ensureLayer();
    ctx.seek(c.in); ctx.play();
    toast('▶ ' + c.title);
  }
  function playAll() {
    var list = clips();
    if (!list.length) { toast('Chưa có clip nào'); return; }
    play = { list: list, i: 0, clip: list[0] };
    playClip(list[0]);
    play.list = list; play.i = 0;
  }
  function advancePlaylist() {
    if (!play || !play.list) { play = null; return; }
    var next = play.list[play.i + 1];
    if (!next) { play = null; ctx.pause(); toast('Hết playlist'); return; }
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
    dimNodes(live, 'x').forEach(function (n) { g.appendChild(n); });
    live.forEach(function (s) {
      var n = shapeNode(s, phase);
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
    catch (e) { toast('Không đọc được pixel của video này — xem §11 trong thiết kế'); return; }
    overlayImage(overlaySVGString(v.currentTime, 0)).then(function (img) {
      g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) {
        if (!b) { toast('Trình duyệt từ chối đọc khung hình (CORS)'); return; }
        download(b, fileStem() + '_' + clock(v.currentTime).replace(':', 'm') + 's.png');
        toast('Đã lưu ảnh');
      }, 'image/png');
    }).catch(function () { toast('Không dựng được lớp đồ hoạ'); });
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

  function exportClip(a, b, title) {
    if (busy) { toast('Đang kết xuất một clip khác'); return; }
    if (!ctx) return;
    if (a == null || b == null || b <= a) { toast('Chưa có đoạn nào được đánh dấu'); return; }
    var mime = pickMime();
    if (!mime) { toast('Trình duyệt này không kết xuất được video'); return; }
    var mp4 = mime.indexOf('mp4') >= 0;
    if (!mp4) toast('Trình duyệt này chỉ tạo được .webm — dùng Chrome hoặc Edge để có .mp4', true);

    busy = true;
    var src = ctx.video.currentSrc || ctx.video.src;
    var W = ctx.video.videoWidth, H = ctx.video.videoHeight;
    var dur = b - a, ext = mp4 ? 'mp4' : 'webm';
    var name = (fileStem() + '_' + (title || clock(a))).replace(/[^\w.-]+/g, '_') + '.' + ext;

    /* A SEPARATE video element, so the analyst's own playback is not dragged
       around by the render — and so this one can carry crossorigin without ever
       risking the one on screen (§11.1: the attribute is a requirement, not a
       hint, and a mismatch means no video at all). */
    var v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.preload = 'auto'; v.muted = false; v.playsInline = true;
    v.src = src;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    var stream = canvas.captureStream(0);
    var track = stream.getVideoTracks()[0];

    var actx = null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        actx = new AC();
        var dest = actx.createMediaStreamDestination();
        actx.createMediaElementSource(v).connect(dest);
        // deliberately NOT connected to actx.destination: this is an offscreen
        // element the analyst never sees, and a render should not talk over them
        dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      }
    } catch (e) { actx = null; }             // no audio is better than no clip

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
    var freezes = shapes
      .filter(function (s) { return s.freeze > 0 && s.t >= a && s.t <= b; })
      .map(function (s) { return { t: s.t, hold: s.freeze }; })
      .sort(function (x, y) { return x.t - y.t; })
      .reduce(function (acc, f) {
        var last = acc[acc.length - 1];
        if (last && Math.abs(last.t - f.t) < 0.25) last.hold = Math.max(last.hold, f.hold);
        else acc.push(f);
        return acc;
      }, []);
    var holdTotal = freezes.reduce(function (n, f) { return n + f.hold; }, 0);
    var total = dur + holdTotal;          // what the FILE will run to, not the source
    var fi = 0, frozen = null, outT = 0;  // outT: seconds of output emitted so far

    var finish = function () {
      busy = false;
      if (actx) try { actx.close(); } catch (e) {}
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
    };
    var fail = function (msg) {
      stopped = true;
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
      finish(); toast(msg, true);
    };

    v.addEventListener('error', function () { fail('Không mở được video để kết xuất'); });
    v.addEventListener('loadedmetadata', function () {
      // a tainted canvas throws only when it is read, so it is proved here, on
      // one pixel, before forty seconds of the analyst's time are spent
      v.currentTime = a;
      v.addEventListener('seeked', function once() {
        v.removeEventListener('seeked', once);
        try { g.drawImage(v, 0, 0, 1, 1); canvas.getContext('2d').getImageData(0, 0, 1, 1); }
        catch (e) { fail('Video này không cho trang đọc pixel (CORS) — không kết xuất được'); return; }
        start();
      });
    });

    function start() {
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
      } catch (e) { fail('MediaRecorder từ chối: ' + (e && e.message)); return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        finish();
        if (stopped) return;
        var blob = new Blob(chunks, { type: mime.split(';')[0] });
        download(blob, name);
        toast('Đã lưu ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB)', true);
      };
      rec.start(1000);
      v.playbackRate = 1;
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
        track.requestFrame();
        outT += 1 / fps;
        toast('Đang kết xuất — ' + Math.round(clamp(outT / total, 0, 1) * 100) + '% ('
              + Math.round(outT) + 's / ' + Math.round(total) + 's). Giữ tab này mở.', true);
        cb();
      };
      if (str !== lastSvg) {
        lastSvg = str;
        overlayImage(str).then(function (img) { lastImg = img; after(); }, after);
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

      var now = v.currentTime;
      if (now >= b - 0.001 || v.ended) {
        try { rec.stop(); } catch (e) {}
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
    var head = el('div', 'fmt-p-head');
    head.appendChild(el('b', null, 'Clip (' + list.length + ')'));
    var bAll = el('button', 'fmt-p-btn', '▶ Phát hết');
    bAll.type = 'button'; bAll.onclick = playAll;
    var bX = el('button', 'fmt-p-btn', '✕');
    bX.type = 'button'; bX.onclick = function () { togglePanel(false); };
    head.appendChild(bAll); head.appendChild(bX);
    panel.appendChild(head);

    if (!list.length) {
      panel.appendChild(el('div', 'fmt-p-none', 'Chưa có clip. Bấm [ và ] trên khung hình, '
        + 'hoặc dùng "Clip quanh event này".'));
      return;
    }
    list.forEach(function (c, i) {
      var row = el('div', 'fmt-p-row');
      var t = el('span', 'fmt-p-t', clock(c.in) + '–' + clock(c.out));
      var nm = el('span', 'fmt-p-nm', c.title);
      var go = el('button', 'fmt-p-btn', '▶'); go.type = 'button';
      go.onclick = function () { play = { list: list, i: i, clip: c }; playClip(c); };
      var dl = el('button', 'fmt-p-btn', '⭳'); dl.type = 'button'; dl.title = 'Tải .mp4 về máy';
      dl.onclick = function () { exportClip(c.in, c.out, c.title); };
      var rm = el('button', 'fmt-p-btn', '✕'); rm.type = 'button';
      rm.onclick = function () {
        var l = clips(); l.splice(i, 1); setClips(l); renderPanel();
      };
      row.appendChild(t); row.appendChild(nm);
      row.appendChild(go); row.appendChild(dl); row.appendChild(rm);
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
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
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
    if (s.kind === 'spotlight')
      return Math.max(0,
        Math.sqrt(Math.pow(p.x - s.at.x, 2) + Math.pow(p.y - s.at.y, 2)) - s.r);
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
    var live = liveAt(t), best = null, bd = 1e9, i, d;
    for (i = live.length - 1; i >= 0; i--) {     // topmost first
      d = distTo(live[i], p);
      if (d != null && d < bd) { bd = d; best = live[i]; }
    }
    return bd <= (layer ? layer.h * 0.05 : 40) ? best : null;
  }

  function menuModel(hit) {
    var t = hit.t, hs = hitShape(hit.p, t);
    return [
      { head: clock(t) + ' · ' + (ctx.win.label || '') },
      { label: 'Bước lùi 1 frame', key: ',', run: function () { step(-1); } },
      { label: 'Bước tới 1 frame', key: '.', run: function () { step(1); } },
      { label: 'Tốc độ', sub: [0.25, 0.5, 1, 1.5, 2].map(function (k) {
          return { label: k + '×', run: function () { setSpeed(k); } };
        }) },
      { label: loopAB ? 'Bỏ lặp A–B' : 'Lặp A–B từ đây', key: 'L', run: function () {
          if (loopAB) { loopAB = null; toast('Đã bỏ lặp'); }
          else { loopAB = { a: t, b: Math.min(ctx.end(), t + 8) }; toast('Lặp ' + clock(loopAB.a) + '–' + clock(loopAB.b)); }
        } },
      { sep: true },
      { label: 'Rọi đèn vào đây', key: 'S', run: function () {
          if (!hit.p) { toast('Bấm vào trong khung hình'); return; }
          ensureLayer();
          // anchored to hit.t, not to now: the video kept playing under the menu
          var sp = addShape({ kind: 'spotlight', space: 'S', at: hit.p,
                     r: Math.round(layer.h * 0.075),
                     style: { color: ACCENT, width: strokeW(), pulse: true } }, t);
          selectShape(sp.id);           // straight into adjust: drag to place, wheel to size
        } },
      { label: dim ? 'Bỏ làm tối' : 'Làm tối phần còn lại', key: 'D', run: function () {
          dim = !dim; ensureLayer(); paint(ctx.video.currentTime, 0);
        } },
      // the Z hint is gone with the key: a menu advertising a shortcut that does
      // nothing is the exact defect this change went in to fix
      { label: zoom ? 'Bỏ phóng to' : 'Phóng to vùng này (hoặc lăn chuột)', run: function () {
          if (zoom) { zoom = null; applyZoom(); toast('Cỡ thật'); }
          else zoomBy(2, hit.p);
        } },
      { label: 'Vẽ', sub: [
          { label: 'Mũi tên', run: function () { armTool('arrow'); } },
          { label: 'Mũi tên cong', run: function () { armTool('arrow', { curved: true }); } },
          { label: 'Mũi tên nét đứt (chạy không bóng)', run: function () { armTool('arrow', { dash: true }); } },
          { label: 'Bút tự do', run: function () { armTool('pen'); } },
          { label: 'Vùng (half-space, pocket)', run: function () { armTool('zone'); } },
          { label: 'Chữ', run: function () { armTool('text'); } },
          { label: 'Đánh dấu cầu thủ', run: function () { armTool('marker'); } },
          { sep: true },
          { label: 'Hoàn tác nét cuối', run: undo },
          { label: 'Xoá hết đồ hoạ', run: clearShapes }
        ] },
      { label: hidden ? 'Hiện lại đồ hoạ' : 'Ẩn đồ hoạ', key: 'H', run: function () {
          hidden = !hidden; if (layer) paint(ctx.video.currentTime, 0);
        } },
      { label: stripOn ? 'Ẩn thanh thời gian' : 'Hiện thanh thời gian', key: 'T',
        run: function () { toggleStrip(); } },

      /* Everything about ONE drawing, and it only appears when the right-click
         actually landed on one. This is the second way into selection; the
         first is clicking its bar on the lane. The drawing layer itself still
         takes no click, which is the rule Film has had since it was written. */
      hs ? { sep: true } : null,
      hs ? { label: 'Hình ở đây: ' + toolName(hs.kind), sub: [
          { label: 'Chọn để sửa', run: function () { selectShape(hs.id); } },
          { label: 'Cửa sổ thời gian', sub: [1, 2, 3, 4, 5, 6, 8, 10].map(function (n) {
              return { label: n + ' s', key: n < 10 ? String(n) : null,
                       run: function () { selectShape(hs.id); setDur(n); } };
            }) },
          { label: hs.life === 'pinned' ? 'Bỏ giữ suốt clip' : '📌 Giữ suốt clip', key: '0',
            run: function () { selectShape(hs.id); togglePin(); } },
          { label: 'Đứng hình khi xuất clip', sub: [0, 2, 3, 4, 5].map(function (n) {
              return { label: n ? n + ' s' : 'Tắt',
                       run: function () { selectShape(hs.id); setFreeze(n); } };
            }) },
          { label: 'Màu', sub: [['Đỏ', ACCENT], ['Trắng', HOME], ['Vàng', AWAY]].map(function (c) {
              return { label: c[0], run: function () {
                hs.style = hs.style || {}; hs.style.color = c[1]; touch(hs);
              } };
            }) },
          { sep: true },
          { label: 'Xoá hình này', key: 'Del', run: function () { removeShape(hs.id); } }
        ] } : null,
      { sep: true },
      { label: 'Đánh dấu ĐẦU clip', key: '[', run: function () { markAt('in'); } },
      { label: 'Đánh dấu CUỐI clip', key: ']', run: function () { markAt('out'); } },
      { label: 'Clip quanh event này (±6s)', run: function () { clipFromEvent(6); } },
      { label: 'Danh sách clip…', key: 'C', run: function () { togglePanel(true); } },
      { sep: true },
      { label: 'Lưu khung hình (.png)', run: savePNG },
      { label: 'Tải đoạn đã đánh dấu (.mp4)', run: function () {
          if (mark.in != null && mark.out != null) exportClip(mark.in, mark.out);
          else {
            var l = clips();
            if (l.length) exportClip(l[l.length - 1].in, l[l.length - 1].out, l[l.length - 1].title);
            else toast('Đánh dấu [ và ] trước đã');
          }
        } },
      { label: 'Chép link tới khoảnh khắc này', run: function () {
          var u = location.href.split('?')[0] + '?t=' + t.toFixed(2);
          if (navigator.clipboard) navigator.clipboard.writeText(u).then(
            function () { toast('Đã chép link'); }, function () { toast(u); });
          else toast(u);
        } },
      { sep: true },
      { label: 'Thoát toàn màn hình', key: 'Esc', run: function () { ctx.exitFull(); } }
    ].filter(function (it) { return !!it; });   // the "Hình ở đây" pair drops out on a miss
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
    build(menu, menuModel(hit));
    ctx.box.appendChild(menu);

    // keep it on screen: the click can be two pixels from the right-hand edge
    var b = ctx.box.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var x = clamp(e.clientX - b.x, 4, Math.max(4, b.width - mw - 4));
    var y = clamp(e.clientY - b.y, 4, Math.max(4, b.height - mh - 4));
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  }

  function build(root, model) {
    model.forEach(function (it) {
      if (it.head) { root.appendChild(el('div', 'fmt-m-head', it.head)); return; }
      if (it.sep) { root.appendChild(el('div', 'fmt-m-sep')); return; }
      var b = el('button', 'fmt-m-it');
      b.type = 'button';
      b.appendChild(el('span', 'fmt-m-l', it.label));
      if (it.key) b.appendChild(el('span', 'fmt-m-k', it.key));
      if (it.sub) {
        b.appendChild(el('span', 'fmt-m-k', '▸'));
        b.classList.add('has-sub');
        var sub = el('div', 'fmt-m-sub');
        build(sub, it.sub);
        var wrap = el('div', 'fmt-m-wrap');
        wrap.appendChild(b); wrap.appendChild(sub);
        root.appendChild(wrap);
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
      if (adjust) { adjust = null; armCursor(); return true; }
      if (mode) { armTool(null); return true; }
      if (selected) { selectShape(null); return true; }
      if (panel) { togglePanel(false); return true; }
      return false;
    }
    if (menu && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter')) return false;
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
      var sp = addShape({ kind: 'spotlight', space: 'S', at: at,
                          r: Math.round(layer.h * 0.075),
                          style: { color: ACCENT, width: strokeW(), pulse: true } });
      selectShape(sp.id);
      toast('Rọi đèn — kéo để dời, lăn chuột để đổi cỡ');
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
      toast(loopAB ? 'Lặp ' + clock(loopAB.a) + '–' + clock(loopAB.b) : 'Đã bỏ lặp');
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------
     The four calls stats-view.js makes
     --------------------------------------------------------------- */
  function attach(c) {
    ctx = c;
    shapes = []; draft = null; mode = null; dim = false; zoom = null;
    loopAB = null; mark = { in: null, out: null }; hidden = false;
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
    // a ?t= link lands on the moment it names, once the file knows its own length
    var q = /[?&]t=(\d+(?:\.\d+)?)/.exec(location.href);
    if (q) ctx.video.addEventListener('loadedmetadata', function once() {
      ctx.video.removeEventListener('loadedmetadata', once);
      ctx.seek(parseFloat(q[1]));
    });
  }
  function relayout() { placeLayer(); placeStrip(); }
  function onMeta() { relayout(); measureFps(); }

  function detach() {
    if (!ctx) return;
    closeMenu();
    // a spotlight dragged in the last fifth of a second still owes the disk a write
    clearTimeout(saveT);
    if (shapes.length) persist();
    if (panel) { panel.remove(); panel = null; }
    if (toastEl) { toastEl.remove(); toastEl = null; }
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
      if (play.list) advancePlaylist(); else { ctx.pause(); play = null; }
      return;
    }
    if (layer) paint(now, (now * 1.2) % 1);
    stripCursor(now);
  }

  function fullscreen(on) {
    full = !!on;
    if (!full) {
      closeMenu();
      if (panel) { togglePanel(false); }
      armTool(null);
      adjust = null; selected = null; armCursor();
      dropStrip();                       // telestration is a full-screen room only
    } else {
      ensureStrip();
    }
    // the stage just changed size; the picture inside it moved with it
    setTimeout(relayout, 0);
  }

  return {
    attach: attach, detach: detach, frame: frame, fullscreen: fullscreen, key: key,
    // named so tests can drive the parts that have no DOM of their own
    _internals: {
      pictureRect: pictureRect, toVideo: toVideo, shapeNode: shapeNode,
      pickMime: pickMime, menuModel: function (h) { return menuModel(h); },
      state: function () {
        return { shapes: shapes, dim: dim, zoom: zoom, hidden: hidden,
                 mode: mode, loopAB: loopAB, mark: mark, full: full, fps: fps,
                 selected: selected, adjust: adjust, ptr: ptr,
                 strip: strip, stripOn: stripOn, defaultDur: defaultDur };
      },
      setCtx: function (c) { ctx = c; }, setFull: function (f) { full = f; },
      clips: clips, setClips: setClips, saveClip: saveClip, STORE_KEY: STORE_KEY,
      // the time model, so the window can be tested without a browser
      liveAt: liveAt, alpha: alpha, upgrade: upgrade, hitShape: hitShape,
      selectShape: selectShape, originOnElement: originOnElement,
      onWheel: function (e) { return onWheel(e); },
      overlaySVGString: function (n, p) { return overlaySVGString(n, p); },
      paint: function (n, p) { return paint(n, p); }
    }
  };
})();
