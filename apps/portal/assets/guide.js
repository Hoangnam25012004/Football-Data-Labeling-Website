/* ============================================================
   client/assets/guide.js — the Film documentation page, and nothing else.

   Three jobs, none of which reaches outside guide.html:

     1. the demo clips        named in the markup, addressed from the manifest
                              below, and replaced by a written notice when the
                              file is not on the bucket yet
     2. scrollspy             which section the reader is in, lit in the
                              contents column
     3. the phone contents    the same list, in a <details>, built from the
                              desktop one so there is one list to keep right

   It does NOT load Supabase, the app, or anything the channel loads. This is
   documentation: it has to open when the session has expired, when nobody is
   signed in, and when the database is down — which is exactly when somebody is
   most likely to be reading it.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     The demo clips

     The bucket the match video already comes from. Playing a video needs no
     CORS — only reading its pixels into a canvas does, which is what the clip
     EXPORT needs and this page never does. So these play today, whatever the
     bucket's header policy is.

     `rev` is the cache key: re-record a clip, keep its name, bump this.
     --------------------------------------------------------- */
  var MEDIA = {
    base: 'https://pub-9cdd291bf181425b9738328ada297691.r2.dev/guide/',
    rev: 1,
    clips: {
      tour:    { file: '01-tour.mp4',        secs: 35 },
      play:    { file: '02-play.mp4',        secs: 28 },
      halves:  { file: '03-halves.mp4',      secs: 18 },
      filters: { file: '04-filters.mp4',     secs: 32 },
      list:    { file: '05-list.mp4',        secs: 26 },
      pitch:   { file: '06-pitch.mp4',       secs: 22 },
      full:    { file: '07-fullscreen.mp4',  secs: 20 },
      menu:    { file: '08-right-click.mp4', secs: 40 },
      draw:    { file: '09-draw.mp4',        secs: 45 },
      spot:    { file: '10-spotlight.mp4',   secs: 30 },
      time:    { file: '11-time-window.mp4', secs: 38 },
      clips:   { file: '12-clips.mp4',       secs: 35 },
      "export": { file: '13-export.mp4',     secs: 30 }
    }
  };

  var poster = function (file) {
    return MEDIA.base + 'posters/' + file.replace(/\.mp4$/, '.jpg') + '?v=' + MEDIA.rev;
  };

  /* The written steps above every clip are the whole instruction; the video is
     the faster way to the same thing. So a file that is not there yet is not an
     error to be logged, it is a sentence to be read. */
  function notice() {
    var box = document.createElement('div');
    box.className = 'g-miss';
    box.innerHTML = '<span><b>Demo video not available yet</b>' +
      'The written steps above are complete on their own.</span>';
    return box;
  }
  /* Put back whatever is in the figure now. Also the answer to a clip that
     turned out to be unplayable after the poster had already been shown. */
  function missing(fig) {
    var old = fig.querySelector('video') || fig.querySelector('.g-miss');
    if (old) fig.replaceChild(notice(), old); else fig.appendChild(notice());
  }

  /* The POSTER is what decides whether a clip is here yet, and it is asked
     first, on its own.

     preload="none" is the whole bandwidth budget of this page — thirteen clips
     asking for metadata on load would be thirteen requests nobody made — but it
     also means the <video> stays silent about a file that is not there until
     somebody presses play. The poster is not gated that way: it is fetched at
     once, so a missing one is the earliest honest answer available, and it
     costs a request that was going to happen anyway. A clip is never uploaded
     without its poster (see §6.3 of the design), so the two travel together.

     The `error` listener stays on the video for the other half of the case: a
     poster that is there over a clip that is not. */
  function buildClips() {
    var figs = document.querySelectorAll('.g-demo[data-clip]');
    Array.prototype.forEach.call(figs, function (fig) {
      var spec = MEDIA.clips[fig.getAttribute('data-clip')];
      /* The notice goes in FIRST, and the video replaces it if there is one.
         Both boxes are 16:9, so the answer arriving does not move the section
         the reader is already in — and if it never arrives, what is on screen
         is the truth rather than a black rectangle. */
      var box = notice();
      fig.appendChild(box);
      if (!spec) return;
      var url = poster(spec.file);
      var probe = new Image();
      probe.onload = function () {
        var v = document.createElement('video');
        v.controls = true;
        v.preload = 'none';
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.poster = url;
        v.src = MEDIA.base + spec.file + '?v=' + MEDIA.rev;
        v.addEventListener('error', function () { missing(fig); });
        if (box.parentNode === fig) fig.replaceChild(v, box); else fig.appendChild(v);
      };
      probe.src = url;
    });
  }

  /* ---------------------------------------------------------
     Scrollspy — which section is being read, lit in the contents

     Scroll position rather than IntersectionObserver, on purpose. Reading down
     a long page, two or three sections are on screen at once for most of the
     scroll, so "is it visible" is the wrong question — "which one have I most
     recently come down into" is the right one, and that is a comparison of
     rectangles against a line under the header. It is also the version that can
     be driven and checked without a compositor.
     --------------------------------------------------------- */
  var LINE = 96;              // just under the sticky header

  function spy() {
    var links = {};
    Array.prototype.forEach.call(
      document.querySelectorAll('.guide-toc a[href^="#"]'), function (a) {
        var id = a.getAttribute('href').slice(1);
        (links[id] = links[id] || []).push(a);
      });
    var sections = Array.prototype.slice.call(
      document.querySelectorAll('.guide-main section[id]'));
    if (!sections.length) return;

    function pick() {
      var best = sections[0].id;
      sections.forEach(function (s) {
        if (s.getBoundingClientRect().top <= LINE) best = s.id;
      });
      /* The last section is usually shorter than the viewport, so its top never
         reaches the line and it could never light. At the bottom of the page it
         is by definition what is being read. */
      if (window.innerHeight + window.pageYOffset >=
          document.documentElement.scrollHeight - 2)
        best = sections[sections.length - 1].id;

      Object.keys(links).forEach(function (id) {
        links[id].forEach(function (a) { a.classList.toggle('on', id === best); });
      });
    }
    /* Throttled on the clock rather than on requestAnimationFrame: a frame is
       not guaranteed to be produced — a page that is not being painted never
       gets one, and the highlight would then sit on whatever section it was
       last left on. Every measurement below is a read, and the writes all come
       after them, so this does not thrash layout. */
    var last = 0, timer = 0;
    function onScroll() {
      var now = Date.now();
      if (now - last >= 80) { last = now; pick(); return; }
      if (timer) return;
      timer = setTimeout(function () { timer = 0; last = Date.now(); pick(); }, 80);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    pick();
  }

  /* ---------------------------------------------------------
     The contents, again, for a narrow screen

     Cloned rather than written twice: one list in the markup, so a section
     added to the page cannot be added to only half of the navigation.
     --------------------------------------------------------- */
  function mobileToc() {
    var src = document.querySelector('.guide-body > .guide-toc');
    var slot = document.getElementById('tocMob');
    if (!src || !slot) return;
    var copy = src.cloneNode(true);
    copy.removeAttribute('id');
    slot.appendChild(copy);
    /* Choosing a section is the end of using the list: leave it closed behind
       them rather than covering what they just asked for. */
    copy.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('a')) slot.open = false;
    });
  }

  function boot() { buildClips(); mobileToc(); spy(); }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
