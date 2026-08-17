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
    layer = { svg: svg, gDim: gDim, gShapes: gShapes, gDraft: gDraft, w: w, h: h };
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
  function applyZoom() {
    if (!ctx) return;
    var t = zoom
      ? 'scale(' + zoom.k + ')'
      : '';
    var o = zoom ? (zoom.x / (layer ? layer.w : 1) * 100) + '% ' + (zoom.y / (layer ? layer.h : 1) * 100) + '%' : '50% 50%';
    ctx.video.style.transform = t; ctx.video.style.transformOrigin = o;
    if (layer) { layer.svg.style.transform = t; layer.svg.style.transformOrigin = o; }
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

  /* Which shapes are live at `now`, drawn. `phase` drives the pulse and is
     quantised by the caller so an export can cache a rasterised frame. */
  function paint(now, phase) {
    if (!layer) return;
    var live = hidden ? [] : shapes.filter(function (s) { return s.in <= now && now <= s.out; });
    layer.gShapes.textContent = '';
    layer.gDim.textContent = '';
    // Dim: one dark sheet with a hole punched at every live spotlight. The hole
    // is what makes the technique work — the eye is given exactly one place to be.
    if (dim && !hidden) {
      var holes = live.filter(function (s) { return s.kind === 'spotlight'; });
      var mid = 'fmtmask' + (layer.maskN = (layer.maskN || 0) + 1);
      var m = svgEl('mask', { id: mid });
      m.appendChild(svgEl('rect', { x: 0, y: 0, width: layer.w, height: layer.h, fill: '#fff' }));
      holes.forEach(function (s) {
        m.appendChild(svgEl('circle', { cx: s.at.x, cy: s.at.y, r: s.r, fill: '#000' }));
      });
      layer.gDim.appendChild(m);
      layer.gDim.appendChild(svgEl('rect', {
        x: 0, y: 0, width: layer.w, height: layer.h,
        fill: '#000', 'fill-opacity': 0.62, mask: 'url(#' + mid + ')'
      }));
    }
    live.forEach(function (s) { layer.gShapes.appendChild(shapeNode(s, phase)); });
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
    s.byMatch[matchKey()] = { shapes: shapes, clips: (s.byMatch[matchKey()] || {}).clips || [] };
    saveStore(s);
  }
  function clips() {
    var s = loadStore();
    return ((s.byMatch || {})[matchKey()] || {}).clips || [];
  }
  function setClips(list) {
    var s = loadStore(); s.byMatch = s.byMatch || {};
    var m = s.byMatch[matchKey()] = s.byMatch[matchKey()] || {};
    m.clips = list; m.shapes = shapes;
    saveStore(s);
  }
  function restore() {
    var m = (loadStore().byMatch || {})[matchKey()];
    shapes = (m && m.shapes) || [];
    if (shapes.length) { ensureLayer(); paint(ctx.video.currentTime, 0); }
  }

  /* ---------------------------------------------------------------
     Adding shapes
     --------------------------------------------------------------- */
  var HOLD = 4;      // how long a mark stays up, in seconds, unless dragged out

  function addShape(s) {
    ensureLayer();
    s.id = id();
    if (s.in == null) { s.in = ctx.video.currentTime; s.out = s.in + HOLD; }
    shapes.push(s); persist();
    paint(ctx.video.currentTime, 0);
    return s;
  }
  function undo() {
    if (!shapes.length) return;
    shapes.pop(); persist(); paint(ctx.video.currentTime, 0);
  }
  function clearShapes() {
    shapes = []; persist();
    if (layer) paint(ctx.video.currentTime, 0);
  }

  /* ---------------------------------------------------------------
     The drawing tools

     Pointer events on the layer, but ONLY while a tool is armed — the video
     surface takes no click otherwise, which is a rule Film has had since it was
     written (a stray click costing the viewer their place) and which this must
     not quietly repeal.
     --------------------------------------------------------------- */
  function armTool(kind, opts) {
    mode = kind ? Object.assign({ kind: kind }, opts || {}) : null;
    ensureLayer();
    if (layer) layer.svg.classList.toggle('fmt-armed', !!mode);
    if (ctx && ctx.box) ctx.box.classList.toggle('fmt-drawing', !!mode);
    toast(mode ? toolName(kind) + ' — kéo trên khung hình. Backspace để thoát.' : '');
  }
  function toolName(k) {
    return { arrow: 'Mũi tên', pen: 'Bút vẽ', zone: 'Vùng', text: 'Chữ',
             marker: 'Đánh dấu cầu thủ', spotlight: 'Rọi đèn' }[k] || k;
  }

  function onDown(e) {
    if (!mode || e.button !== 0) return;
    var p = toVideo(e.clientX, e.clientY); if (!p) return;
    e.preventDefault(); e.stopPropagation();
    var now = ctx.video.currentTime;
    var base = { space: 'S', in: now, out: now + HOLD, style: { color: mode.color || ACCENT, width: strokeW() } };

    if (mode.kind === 'text') { textAt(p, base); return; }
    if (mode.kind === 'spotlight') {
      addShape(Object.assign(base, { kind: 'spotlight', at: p, r: Math.round(layer.h * 0.075) }));
      base.style.pulse = true; return;
    }
    if (mode.kind === 'marker') {
      addShape(Object.assign(base, { kind: 'marker', at: p, r: Math.round(layer.h * 0.028) }));
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
    addShape(d);
  }
  function drawDraft() {
    if (!layer) return;
    layer.gDraft.textContent = '';
    if (draft) layer.gDraft.appendChild(shapeNode(draft, 0));
  }
  function strokeW() { return Math.max(3, Math.round((layer ? layer.h : 1080) * 0.005)); }

  /* A real input, placed where the click was: typing into a prompt() would take
     the focus out of the document and, in some browsers, out of full screen. */
  function textAt(p, base) {
    var r = pictureRect(), s = ctx.stage.getBoundingClientRect();
    var inp = el('input', 'fmt-text-in');
    inp.type = 'text'; inp.placeholder = 'Nhập chữ, Enter để đặt';
    inp.style.left = (r.x - s.x + p.x / layer.w * r.w) + 'px';
    inp.style.top = (r.y - s.y + p.y / layer.h * r.h) + 'px';
    ctx.stage.appendChild(inp);
    inp.focus();
    var done = function (ok) {
      var v = inp.value.trim();
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (ok && v) addShape(Object.assign(base, { kind: 'text', at: p, text: v }));
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
  function playClip(c) {
    if (!ctx) return;
    play = { clip: c, list: play && play.list, i: play && play.i };
    if (c.shapes && c.shapes.length) {
      shapes = c.shapes.map(function (s) { return JSON.parse(JSON.stringify(s)); });
      ensureLayer();
    }
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
  function overlaySVGString(now, phase) {
    // the same nodes the screen is showing, serialised standalone
    var w = layer ? layer.w : ctx.video.videoWidth, h = layer ? layer.h : ctx.video.videoHeight;
    ensureLayer();
    paint(now, phase);
    var inner = layer.gDim.innerHTML + layer.gShapes.innerHTML;
    return '<svg xmlns="' + SVGNS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">'
      + inner + '</svg>';
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
    function pump() {
      if (stopped) return;
      var now = v.currentTime;
      if (now >= b - 0.001 || v.ended) {
        try { rec.stop(); } catch (e) {}
        return;
      }
      g.drawImage(v, 0, 0, W, H);
      var phase = Math.round(((now * 1.2) % 1) * 8) / 8;     // 8 buckets: the cache holds
      var str = overlaySVGString(now, phase);
      var after = function () {
        if (lastImg) g.drawImage(lastImg, 0, 0, W, H);
        track.requestFrame();
        var done = clamp((now - a) / dur, 0, 1);
        toast('Đang kết xuất — ' + Math.round(done * 100) + '% (' + Math.round(now - a) + 's / '
              + Math.round(dur) + 's). Giữ tab này mở.', true);
        setTimeout(pump, 1000 / fps);
      };
      if (str !== lastSvg) {
        lastSvg = str;
        overlayImage(str).then(function (img) { lastImg = img; after(); }, after);
      } else after();
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

  function menuModel(hit) {
    var t = hit.t;
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
          addShape({ kind: 'spotlight', space: 'S', at: hit.p,
                     r: Math.round(layer.h * 0.075),
                     style: { color: ACCENT, width: strokeW(), pulse: true } });
        } },
      { label: dim ? 'Bỏ làm tối' : 'Làm tối phần còn lại', key: 'D', run: function () {
          dim = !dim; ensureLayer(); paint(ctx.video.currentTime, 0);
        } },
      { label: zoom ? 'Bỏ phóng to' : 'Phóng to vùng này', key: 'Z', run: function () {
          zoom = zoom ? null : { k: 2, x: hit.p ? hit.p.x : 0, y: hit.p ? hit.p.y : 0 };
          applyZoom();
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
    ];
  }

  function openMenu(e) {
    if (!ctx || !full) return;
    e.preventDefault();
    closeMenu();
    ctx.pause();                       // the menu is about THIS moment; do not let it drift
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
    if (k === 'Backspace') {
      if (menu) { closeMenu(); return true; }
      if (draft) { draft = null; drawDraft(); return true; }
      if (mode) { armTool(null); return true; }
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
    if (k === 'z' || k === 'Z') {
      zoom = zoom ? null : { k: 2, x: layer ? layer.w / 2 : 0, y: layer ? layer.h / 2 : 0 };
      applyZoom(); return true;
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
    ctx.stage.addEventListener('contextmenu', openMenu);
    ctx.stage.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', placeLayer);
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
  function onMeta() { placeLayer(); measureFps(); }

  function detach() {
    if (!ctx) return;
    closeMenu();
    if (panel) { panel.remove(); panel = null; }
    if (toastEl) { toastEl.remove(); toastEl = null; }
    ctx.stage.removeEventListener('contextmenu', openMenu);
    ctx.stage.removeEventListener('pointerdown', onDown);
    window.removeEventListener('resize', placeLayer);
    ctx.video.removeEventListener('loadedmetadata', onMeta);
    try { ctx.video.style.transform = ''; } catch (e) {}
    dropLayer();
    ctx = null; full = false; mode = null; draft = null; play = null;
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
  }

  function fullscreen(on) {
    full = !!on;
    if (!full) {
      closeMenu();
      if (panel) { togglePanel(false); }
      armTool(null);
    }
    // the stage just changed size; the picture inside it moved with it
    setTimeout(placeLayer, 0);
  }

  return {
    attach: attach, detach: detach, frame: frame, fullscreen: fullscreen, key: key,
    // named so tests can drive the parts that have no DOM of their own
    _internals: {
      pictureRect: pictureRect, toVideo: toVideo, shapeNode: shapeNode,
      pickMime: pickMime, menuModel: function (h) { return menuModel(h); },
      state: function () {
        return { shapes: shapes, dim: dim, zoom: zoom, hidden: hidden,
                 mode: mode, loopAB: loopAB, mark: mark, full: full, fps: fps };
      },
      setCtx: function (c) { ctx = c; }, setFull: function (f) { full = f; },
      clips: clips, setClips: setClips, saveClip: saveClip, STORE_KEY: STORE_KEY
    }
  };
})();
