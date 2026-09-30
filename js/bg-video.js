/* ═══════════════════════════════════════════════
   Cowboy Healthcare — dimmed background video
   ───────────────────────────────────────────────
   Plays a short, muted, looping clip behind a section, crossfading
   between several clips so the background feels alive without ever
   pulling attention from the words on top.

   Usage:
     <div class="bgv" data-clips="assets/video/a.mp4|assets/video/b.mp4"
          data-poster="images/still.jpg"></div>
     <script src="js/bg-video.js"></script>

   It stays out of the way when it should:
     • phones (< 901px wide)   → poster image only, no video download
     • prefers-reduced-motion  → poster image only, nothing moves
     • Data Saver / 2g         → poster image only
     • tab hidden / scrolled past → paused, so it costs nothing
     • no clips configured or a clip fails → the page's own background
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  function mount(root) {
    var clips = (root.dataset.clips || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var poster = root.dataset.poster || '';
    if (poster) root.style.backgroundImage = 'url("' + poster + '")';
    if (!clips.length) return;

    // Every read of browser state is guarded so it degrades to the poster.
    function mm(q) { try { return window.matchMedia && window.matchMedia(q).matches; } catch (e) { return false; } }
    var conn = {};
    try { conn = navigator.connection || {}; } catch (e) { conn = {}; }
    // Desktop only — phones keep the still poster (saves mobile data).
    if (!mm('(min-width: 901px)')) return;
    if (mm('(prefers-reduced-motion: reduce)') || conn.saveData || /^(slow-2g|2g)$/.test(conn.effectiveType || '')) return;

    // Two layers so one can fade in while the other is still playing.
    var layers = [make(), make()];
    layers.forEach(function (v) { root.appendChild(v); });
    var index = 0, active = 0, started = false, onScreen = true;

    function make() {
      var v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = false;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.preload = 'none';
      v.disablePictureInPicture = true;
      v.tabIndex = -1;
      return v;
    }

    function load(v, src) {
      v.src = src;
      v.preload = 'auto';
      v.load();
    }

    function play(v) {
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay refused: the poster stays */ });
    }

    // Swap to the next clip a beat before the current one ends.
    function watch(v) {
      v.addEventListener('timeupdate', function () {
        if (!v.duration || v.dataset.handoff === '1') return;
        if (v.duration - v.currentTime > 0.9) return;
        v.dataset.handoff = '1';
        next();
      });
      v.addEventListener('error', function () { v.dataset.handoff = '1'; next(); });
    }
    layers.forEach(watch);

    function next() {
      if (clips.length < 2) { var cur = layers[active]; cur.currentTime = 0; cur.dataset.handoff = ''; play(cur); return; }
      index = (index + 1) % clips.length;
      var incoming = layers[1 - active];
      incoming.dataset.handoff = '';
      load(incoming, clips[index]);
      incoming.addEventListener('canplay', function start() {
        incoming.removeEventListener('canplay', start);
        play(incoming);
        incoming.classList.add('is-on');
        layers[active].classList.remove('is-on');
        var outgoing = layers[active];
        active = 1 - active;
        setTimeout(function () { try { outgoing.pause(); } catch (e) {} }, 1600);
      }, { once: true });
    }

    function begin() {
      if (started) return;
      started = true;
      load(layers[0], clips[0]);
      layers[0].addEventListener('canplay', function on() {
        layers[0].removeEventListener('canplay', on);
        play(layers[0]);
        layers[0].classList.add('is-on');
        root.classList.add('has-video');
      }, { once: true });
    }

    function pauseAll() { layers.forEach(function (v) { try { v.pause(); } catch (e) {} }); }
    function resume() { if (started && onScreen && !document.hidden) play(layers[active]); }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseAll(); else resume();
    });
    // Start right away (a fixed backdrop is on screen by definition); the
    // observer only pauses it once it has scrolled well out of view.
    begin();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) resume(); else pauseAll();
      }, { threshold: 0.01 }).observe(root);
    }
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('.bgv[data-clips]'), mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CowboyBgVideo = { mount: mount };
})();
