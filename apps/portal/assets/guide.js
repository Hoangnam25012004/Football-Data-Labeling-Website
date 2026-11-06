/* ============================================================
   client/assets/guide.js — the Film documentation page, and nothing else.

   Two jobs, none of which reaches outside guide.html:

     1. scrollspy             which section the reader is in, lit in the
                              contents column
     2. the phone contents    the same list, in a <details>, built from the
                              desktop one so there is one list to keep right

   The screenshots need no script: plain images with loading="lazy", so the page
   costs only what the reader scrolls to.

   It does NOT load Supabase, the app, or anything the channel loads. This is
   documentation: it has to open when the session has expired, when nobody is
   signed in, and when the database is down — which is exactly when somebody is
   most likely to be reading it.
   ============================================================ */
(function () {
  'use strict';

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

  function boot() { mobileToc(); spy(); }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
